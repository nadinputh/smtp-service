import type { FastifyInstance } from "fastify";
import { getEnv, systemEmailFrom } from "@mailpocket/env";
import { getDb, messages, inboxes } from "@mailpocket/db";
import { createStorage } from "@mailpocket/storage";
import { eq, desc, and, sql, count, gt, lt, inArray } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import {
  requireInboxRole,
  requireMessageRole,
  requireUuidParams,
  isUuid,
} from "../middleware/access.js";
import { normalizeEmail } from "../lib/address.js";
import { clampInt } from "../lib/validate.js";
import { buildMessageConditions } from "../lib/message-filters.js";
import { attachmentHeaders } from "../lib/attachment.js";
import { findSuppressed } from "../lib/suppression.js";
import { senderDomainError } from "../lib/sender-domain.js";
import { simpleParser } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import Redis from "ioredis";
import { analyzeCompatibility } from "../lib/html-analyzer.js";
import {
  createOutboundQueue,
  createRedisConnection,
  type OutboundEmailPayload,
} from "@mailpocket/queue";

// mailparser returns most header values as plain strings, but "structured"
// headers (Content-Type, Content-Disposition, ...) come back as an object
// instead — { text } for address-like headers, or { value, params } for
// MIME-parameter headers. Format both back into the single-line string form
// the header actually had on the wire; anything else falls back to
// JSON.stringify so at least something renders instead of throwing.
function formatHeaderValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object") {
    if ("text" in value && typeof (value as any).text === "string") {
      return (value as any).text;
    }
    if ("value" in value && typeof (value as any).value === "string") {
      const { value: base, params } = value as {
        value: string;
        params?: Record<string, string>;
      };
      const paramStr = params
        ? Object.entries(params)
            .map(([k, v]) => `${k}=${v}`)
            .join("; ")
        : "";
      return paramStr ? `${base}; ${paramStr}` : base;
    }
  }
  return JSON.stringify(value);
}

/** Most message ids a bulk endpoint accepts in one request. */
const BULK_MAX = 1000;

export function registerMessageRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);
  const storage = createStorage(
    env.STORAGE_DRIVER === "local"
      ? {
          driver: "local",
          basePath: env.STORAGE_LOCAL_PATH,
          bucket: env.MINIO_BUCKET,
        }
      : {
          driver: "s3",
          endPoint: env.MINIO_ENDPOINT,
          port: env.MINIO_PORT,
          accessKey: env.MINIO_ACCESS_KEY!,
          secretKey: env.MINIO_SECRET_KEY!,
          useSSL: env.MINIO_USE_SSL,
          bucket: env.MINIO_BUCKET,
        },
  );

  const redisConn = createRedisConnection({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  });
  const outboundQueue = createOutboundQueue(redisConn);

  /** Remove a message's raw .eml and attachments; leftovers are only logged. */
  async function removeStored(
    rawKey: string,
    attachments: { storageKey: string }[] | null,
  ) {
    const keys = [rawKey, ...(attachments ?? []).map((a) => a.storageKey)];
    for (const key of keys) {
      try {
        await storage.removeObject(key);
      } catch (err) {
        app.log.warn({ err, key }, "Failed to remove stored object");
      }
    }
  }

  const redisPub = new Redis.default({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
  });

  // List messages in an inbox with search, filters, and pagination
  app.get<{
    Params: { id: string };
    Querystring: {
      q?: string;
      from?: string;
      to?: string;
      status?: string;
      after?: string;
      before?: string;
      page?: string;
      limit?: string;
      ruleId?: string;
      idsOnly?: string;
    };
  }>(
    "/api/inboxes/:id/messages",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("viewer")] },
    async (request, reply) => {
      const { id } = request.params;
      const {
        q,
        from: fromFilter,
        to: toFilter,
        status: statusFilter,
        after,
        before,
        page: pageStr = "1",
        limit: limitStr = "50",
        ruleId,
        idsOnly,
      } = request.query;

      const page = clampInt(pageStr, 1, 1_000_000);
      const limit = clampInt(limitStr, 50, 100);
      const offset = (page - 1) * limit;

      if (ruleId !== undefined && !isUuid(ruleId)) {
        return reply.status(400).send({ error: "ruleId must be a UUID" });
      }

      const conditions = await buildMessageConditions(db, id, {
        q,
        from: fromFilter,
        to: toFilter,
        status: statusFilter,
        after,
        before,
        ruleId,
      });

      const where = and(...conditions);

      // "Select all N matching": ids only, capped at what the bulk endpoints accept
      if (idsOnly === "1") {
        const rows = await db
          .select({ id: messages.id })
          .from(messages)
          .where(where)
          .orderBy(desc(messages.createdAt))
          .limit(BULK_MAX);
        return { ids: rows.map((r) => r.id) };
      }

      // Single query: total + unread count via conditional aggregate
      const [totals] = await db
        .select({
          total: count(),
          unreadTotal: sql<number>`COUNT(*) FILTER (WHERE ${messages.isRead} = false)`,
        })
        .from(messages)
        .where(where);

      const result = await db
        .select({
          id: messages.id,
          from: messages.from,
          to: messages.to,
          subject: messages.subject,
          date: messages.date,
          size: messages.size,
          status: messages.status,
          isRead: messages.isRead,
          createdAt: messages.createdAt,
          textPreview: sql<string | null>`LEFT(${messages.text}, 150)`,
          // Inspection signals, so the list can show them without opening rows
          attachmentCount: sql<number>`COALESCE(jsonb_array_length(${messages.attachments}), 0)::int`,
          spamScore: messages.spamScore,
          bounceReason: sql<
            string | null
          >`(SELECT COALESCE(dl.smtp_response, dl.status) FROM delivery_logs dl WHERE dl.message_id = "messages"."id" AND dl.status IN ('bounced','failed','deferred') ORDER BY dl.created_at DESC LIMIT 1)`,
        })
        .from(messages)
        .where(where)
        .orderBy(desc(messages.createdAt))
        .limit(limit)
        .offset(offset);

      // Inbox-wide (ignores the active filters) so failures stay visible from any view
      const [attention] = await db
        .select({ n: count() })
        .from(messages)
        .where(
          and(
            eq(messages.inboxId, id),
            inArray(messages.status, ["bounced", "failed"]),
          ),
        );

      return {
        messages: result,
        total: totals.total,
        unreadTotal: Number(totals.unreadTotal),
        attentionTotal: attention.n,
        page,
        limit,
      };
    },
  );

  // Get a single message with full details
  app.get<{ Params: { id: string } }>(
    "/api/messages/:id",
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("viewer")],
    },
    async (request, reply) => {
      const { id } = request.params;
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }

      return message;
    },
  );

  // Download the raw .eml for a message
  app.get<{ Params: { id: string } }>(
    "/api/messages/:id/raw",
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("viewer")],
    },
    async (request, reply) => {
      const { id } = request.params;
      const [message] = await db
        .select({ rawKey: messages.rawKey, inboxId: messages.inboxId })
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }

      const stream = await storage.getObject(message.rawKey);
      reply.header("Content-Type", "message/rfc822");
      reply.header("Content-Disposition", `attachment; filename="${id}.eml"`);
      return reply.send(stream);
    },
  );

  // Get raw MIME source as plain text
  app.get<{ Params: { id: string } }>(
    "/api/messages/:id/source",
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("viewer")],
    },
    async (request, reply) => {
      const { id } = request.params;
      const [message] = await db
        .select({ rawKey: messages.rawKey, inboxId: messages.inboxId })
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }

      const buffer = await storage.getObjectAsBuffer(message.rawKey);
      reply.header("Content-Type", "text/plain; charset=utf-8");
      return reply.send(buffer.toString("utf-8"));
    },
  );

  // Get parsed headers from the raw email
  app.get<{ Params: { id: string } }>(
    "/api/messages/:id/headers",
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("viewer")],
    },
    async (request, reply) => {
      const { id } = request.params;
      const [message] = await db
        .select({ rawKey: messages.rawKey, inboxId: messages.inboxId })
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }

      const buffer = await storage.getObjectAsBuffer(message.rawKey);
      const parsed = await simpleParser(buffer);

      // Convert headers to a flat array of {key, value}
      const allHeaders: { key: string; value: string }[] = [];
      parsed.headers.forEach((value, key) => {
        allHeaders.push({ key, value: formatHeaderValue(value) });
      });

      // Group headers by category
      const routingKeys = new Set([
        "received",
        "return-path",
        "x-originating-ip",
      ]);
      const authKeys = new Set([
        "dkim-signature",
        "authentication-results",
        "received-spf",
        "arc-seal",
        "arc-message-signature",
        "arc-authentication-results",
      ]);
      const identityKeys = new Set([
        "from",
        "to",
        "cc",
        "bcc",
        "reply-to",
        "sender",
      ]);
      const idKeys = new Set(["message-id", "in-reply-to", "references"]);
      const contentKeys = new Set([
        "content-type",
        "content-transfer-encoding",
        "mime-version",
      ]);

      type HeaderEntry = { key: string; value: string };
      const groups: Record<string, HeaderEntry[]> = {
        routing: [],
        authentication: [],
        identity: [],
        identification: [],
        content: [],
        custom: [],
        other: [],
      };

      for (const h of allHeaders) {
        const k = h.key.toLowerCase();
        if (routingKeys.has(k)) groups.routing.push(h);
        else if (authKeys.has(k)) groups.authentication.push(h);
        else if (identityKeys.has(k)) groups.identity.push(h);
        else if (idKeys.has(k)) groups.identification.push(h);
        else if (contentKeys.has(k)) groups.content.push(h);
        else if (k.startsWith("x-")) groups.custom.push(h);
        else groups.other.push(h);
      }

      // Parse Received headers into hops with timestamps
      const hops: {
        from: string;
        by: string;
        timestamp: string | null;
        delay: string | null;
      }[] = [];
      const receivedHeaders = allHeaders.filter(
        (h) => h.key.toLowerCase() === "received",
      );
      let prevTime: number | null = null;

      // Received headers are in reverse order (most recent first)
      for (let i = receivedHeaders.length - 1; i >= 0; i--) {
        const raw = receivedHeaders[i].value;
        const fromMatch = raw.match(/from\s+([\w.\-]+)/i);
        const byMatch = raw.match(/by\s+([\w.\-]+)/i);
        const dateMatch = raw.match(/;\s*(.+)$/);
        let timestamp: string | null = null;
        let delay: string | null = null;

        if (dateMatch) {
          const parsed = new Date(dateMatch[1].trim());
          if (!isNaN(parsed.getTime())) {
            timestamp = parsed.toISOString();
            if (prevTime !== null) {
              const diffMs = parsed.getTime() - prevTime;
              const diffSec = Math.round(diffMs / 1000);
              delay =
                diffSec < 1
                  ? "<1s"
                  : diffSec < 60
                    ? `${diffSec}s`
                    : `${Math.round(diffSec / 60)}m`;
            }
            prevTime = parsed.getTime();
          }
        }
        hops.push({
          from: fromMatch?.[1] ?? "unknown",
          by: byMatch?.[1] ?? "unknown",
          timestamp,
          delay,
        });
      }

      // Parse authentication results
      const authResultsHeader = allHeaders.find(
        (h) => h.key.toLowerCase() === "authentication-results",
      );
      const authChecks: { method: string; result: string }[] = [];
      if (authResultsHeader) {
        const val = authResultsHeader.value;
        for (const method of ["spf", "dkim", "dmarc"]) {
          const match = val.match(new RegExp(`${method}=(\\w+)`, "i"));
          if (match) {
            authChecks.push({
              method: method.toUpperCase(),
              result: match[1].toLowerCase(),
            });
          }
        }
      }

      return { headers: allHeaders, groups, hops, authChecks };
    },
  );

  // Analyze email HTML compatibility across email clients
  app.get<{ Params: { id: string } }>(
    "/api/messages/:id/compatibility",
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("viewer")],
    },
    async (request, reply) => {
      const { id } = request.params;
      const [message] = await db
        .select({ html: messages.html })
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }

      if (!message.html) {
        return reply.status(200).send({
          overallScores: [],
          features: [],
          summary: {
            totalFeaturesDetected: 0,
            fullyCompatibleClients: 0,
            problematicFeatures: 0,
          },
        });
      }

      return analyzeCompatibility(message.html);
    },
  );

  // Delete a single message
  app.delete<{ Params: { id: string } }>(
    "/api/messages/:id",
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("editor")],
    },
    async (request, reply) => {
      const { id } = request.params;
      const [message] = await db
        .select({
          id: messages.id,
          inboxId: messages.inboxId,
          rawKey: messages.rawKey,
          attachments: messages.attachments,
        })
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }

      await db.delete(messages).where(eq(messages.id, id));
      await removeStored(message.rawKey, message.attachments);

      return { success: true };
    },
  );

  // Delete a selection of messages in an inbox
  app.post<{
    Params: { id: string };
    Body: { messageIds: string[] };
  }>(
    "/api/inboxes/:id/messages/delete",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("editor")] },
    async (request, reply) => {
      const { id } = request.params;
      const messageIds = request.body?.messageIds;

      if (
        !Array.isArray(messageIds) ||
        messageIds.length === 0 ||
        messageIds.length > BULK_MAX ||
        !messageIds.every(isUuid)
      ) {
        return reply.status(400).send({
          error: "messageIds must be 1-1000 message UUIDs",
        });
      }

      const removed = await db
        .delete(messages)
        .where(and(eq(messages.inboxId, id), inArray(messages.id, messageIds)))
        .returning({
          rawKey: messages.rawKey,
          attachments: messages.attachments,
        });

      for (const msg of removed) {
        await removeStored(msg.rawKey, msg.attachments);
      }

      return { success: true, deleted: removed.length };
    },
  );

  // Delete all messages in an inbox
  app.delete<{ Params: { id: string } }>(
    "/api/inboxes/:id/messages",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("editor")] },
    async (request, reply) => {
      const { id } = request.params;

      // Delete rows first, then clean storage best-effort: a storage failure
      // must not leave rows pointing at half-deleted objects.
      const inboxMessages = await db
        .delete(messages)
        .where(eq(messages.inboxId, id))
        .returning({
          rawKey: messages.rawKey,
          attachments: messages.attachments,
        });

      for (const msg of inboxMessages) {
        await removeStored(msg.rawKey, msg.attachments);
      }

      return { success: true, deleted: inboxMessages.length };
    },
  );

  // ─── Forward a message ──────────────────────────────────
  app.post<{ Params: { id: string }; Body: { to: string } }>(
    "/api/messages/:id/forward",
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("editor")],
    },
    async (request, reply) => {
      const { id } = request.params;
      const toEmail = normalizeEmail(request.body?.to);

      if (!toEmail) {
        return reply
          .status(400)
          .send({ error: "to must be a valid email address" });
      }

      const suppressed = await findSuppressed(db, request.user!.userId, [
        toEmail,
      ]);
      if (suppressed.size > 0) {
        return reply.status(422).send({
          error: "Recipient is suppressed",
          suppressedEmails: [...suppressed],
        });
      }

      // Fetch the message
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }

      // Download the raw .eml
      const rawBuffer = await storage.getObjectAsBuffer(message.rawKey);

      // Build a forwarding MIME envelope
      const fromAddr = systemEmailFrom(env);
      const fwdSubject = `[Fwd] ${message.subject ?? "(no subject)"}`;

      const mail = new MailComposer({
        from: fromAddr,
        to: request.body.to.trim(),
        subject: fwdSubject,
        text: `---------- Forwarded message ----------\nFrom: ${message.from}\nSubject: ${message.subject ?? ""}\nDate: ${message.date?.toISOString() ?? ""}\n\n${message.text ?? ""}`,
        html: message.html
          ? `<p><strong>---------- Forwarded message ----------</strong><br>From: ${message.from}<br>Subject: ${message.subject ?? ""}<br>Date: ${message.date?.toISOString() ?? ""}</p><hr>${message.html}`
          : undefined,
        attachments: [
          {
            filename: "forwarded.eml",
            content: rawBuffer,
            contentType: "message/rfc822",
          },
        ],
      });

      const fwdBuffer = await new Promise<Buffer>((resolve, reject) => {
        mail.compile().build((err: Error | null, msg: Buffer) => {
          if (err) reject(err);
          else resolve(msg);
        });
      });

      // Store forwarded message
      const fwdMessageId = randomUUID();
      const rawKey = `outbound/${fwdMessageId}.eml`;
      await storage.putObject(
        rawKey,
        Readable.from(fwdBuffer),
        fwdBuffer.length,
      );

      // Insert message record
      await db.insert(messages).values({
        id: fwdMessageId,
        inboxId: message.inboxId,
        from: fromAddr,
        to: [toEmail],
        subject: fwdSubject,
        text: message.text ?? null,
        html: message.html ?? null,
        rawKey,
        size: fwdBuffer.length,
        status: "queued",
      });

      // Queue for delivery
      const payload: OutboundEmailPayload = {
        messageId: fwdMessageId,
        userId: request.user!.userId,
        from: fromAddr,
        to: [toEmail],
        rawKey,
      };
      await outboundQueue.add("send", payload, { jobId: fwdMessageId });

      return reply.status(202).send({
        id: fwdMessageId,
        status: "queued",
        message: "Message forwarded and queued for delivery",
      });
    },
  );

  // ─── Resend a bounced / failed message ──────────────────
  // Re-queues the original outbound message. The worker re-checks the
  // suppression list and skips recipients it already delivered to.
  app.post<{ Params: { id: string } }>(
    "/api/messages/:id/resend",
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("editor")],
    },
    async (request, reply) => {
      const { id } = request.params;

      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);
      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }
      if (
        !message.rawKey.startsWith("outbound/") ||
        !["bounced", "failed"].includes(message.status)
      ) {
        return reply
          .status(400)
          .send({ error: "Only bounced or failed messages can be resent" });
      }

      const recipients = [
        ...new Set(
          [
            ...(message.to ?? []),
            ...(message.cc ?? []),
            ...(message.bcc ?? []),
          ].map((r) => r.toLowerCase()),
        ),
      ];
      const suppressed = await findSuppressed(
        db,
        request.user!.userId,
        recipients,
      );
      const envelopeTo = recipients.filter((r) => !suppressed.has(r));
      if (envelopeTo.length === 0) {
        return reply.status(422).send({
          error: "Every recipient is on your suppression list",
          suppressedEmails: [...suppressed],
        });
      }

      const senderError = await senderDomainError(
        db,
        env.APP_MODE,
        request.user!.userId,
        message.from,
      );
      if (senderError) {
        return reply.status(422).send({ error: senderError });
      }

      // Claim atomically so a double-click can't queue it twice
      const claimed = await db
        .update(messages)
        .set({ status: "queued" })
        .where(
          and(
            eq(messages.id, id),
            inArray(messages.status, ["bounced", "failed"]),
          ),
        )
        .returning({ id: messages.id });
      if (claimed.length === 0) {
        return reply
          .status(409)
          .send({ error: "Message is already being resent" });
      }

      const payload: OutboundEmailPayload = {
        messageId: id,
        userId: request.user!.userId,
        from: message.from,
        to: envelopeTo,
        rawKey: message.rawKey,
        requireVerifiedSender: true,
      };
      // Fresh job id: the original job's id may still be held by BullMQ
      await outboundQueue.add("send", payload, {
        jobId: `${id}-resend-${Date.now()}`,
      });

      return reply.status(202).send({
        id,
        status: "queued",
        message: "Message queued for redelivery",
        ...(suppressed.size > 0 ? { suppressed: [...suppressed] } : {}),
      });
    },
  );

  // ─── Cancel a scheduled message ─────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/api/messages/:id/schedule",
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("editor")],
    },
    async (request, reply) => {
      const { id } = request.params;

      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }

      if (message.status !== "scheduled") {
        return reply
          .status(400)
          .send({ error: "Only scheduled messages can be cancelled" });
      }

      // Remove from BullMQ queue
      const job = await outboundQueue.getJob(id);
      if (job) {
        try {
          await job.remove();
        } catch {
          // BullMQ refuses to remove a job a worker has already picked up.
          return reply
            .status(409)
            .send({ error: "Message is already being delivered" });
        }
      }

      // Update status
      await db
        .update(messages)
        .set({ status: "cancelled" })
        .where(eq(messages.id, id));

      return { success: true, status: "cancelled" };
    },
  );

  // ─── Stream an attachment ───────────────────────────────
  app.get<{ Params: { id: string; index: string } }>(
    "/api/messages/:id/attachments/:index",
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("viewer")],
    },
    async (request, reply) => {
      const { id, index: indexStr } = request.params;
      const idx = parseInt(indexStr, 10);

      if (isNaN(idx) || idx < 0) {
        return reply.status(400).send({ error: "Invalid attachment index" });
      }

      const [message] = await db
        .select({
          inboxId: messages.inboxId,
          attachments: messages.attachments,
        })
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }

      if (!message.attachments || idx >= message.attachments.length) {
        return reply.status(404).send({ error: "Attachment not found" });
      }

      const att = message.attachments[idx];
      const stream = await storage.getObject(att.storageKey);

      reply.headers(attachmentHeaders(att.filename, att.contentType));
      return reply.send(stream);
    },
  );

  // ─── Mark a single message as read ─────────────────────
  app.put<{ Params: { id: string } }>(
    "/api/messages/:id/read",
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("viewer")],
    },
    async (request, reply) => {
      const { id } = request.params;

      const [message] = await db
        .select({ id: messages.id, inboxId: messages.inboxId })
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }

      await db
        .update(messages)
        .set({ isRead: true })
        .where(eq(messages.id, id));

      await redisPub.publish(
        "read:changed",
        JSON.stringify({
          inboxId: message.inboxId,
          messageId: id,
          isRead: true,
        }),
      );

      return { success: true };
    },
  );

  // ─── Mark a single message as unread ───────────────────
  app.delete<{ Params: { id: string } }>(
    "/api/messages/:id/read",
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("viewer")],
    },
    async (request, reply) => {
      const { id } = request.params;

      const [message] = await db
        .select({ id: messages.id, inboxId: messages.inboxId })
        .from(messages)
        .where(eq(messages.id, id))
        .limit(1);

      if (!message) {
        return reply.status(404).send({ error: "Message not found" });
      }

      await db
        .update(messages)
        .set({ isRead: false })
        .where(eq(messages.id, id));

      await redisPub.publish(
        "read:changed",
        JSON.stringify({
          inboxId: message.inboxId,
          messageId: id,
          isRead: false,
        }),
      );

      return { success: true };
    },
  );

  // ─── Mark all messages in an inbox as read ─────────────
  app.put<{ Params: { id: string } }>(
    "/api/inboxes/:id/messages/read-all",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("viewer")] },
    async (request, _reply) => {
      const { id: inboxId } = request.params;

      await db
        .update(messages)
        .set({ isRead: true })
        .where(and(eq(messages.inboxId, inboxId), eq(messages.isRead, false)));

      await redisPub.publish(
        "read:changed",
        JSON.stringify({ inboxId, allRead: true }),
      );

      return { success: true };
    },
  );

  // ─── Batch mark messages as read/unread ────────────────
  app.put<{
    Params: { id: string };
    Body: { messageIds: string[]; isRead: boolean };
  }>(
    "/api/inboxes/:id/messages/read",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("viewer")] },
    async (request, reply) => {
      const { id: inboxId } = request.params;
      const { messageIds, isRead } = request.body ?? {};

      if (
        !Array.isArray(messageIds) ||
        messageIds.length === 0 ||
        messageIds.length > BULK_MAX ||
        !messageIds.every(isUuid)
      ) {
        return reply.status(400).send({
          error: "messageIds must be 1-1000 message UUIDs",
        });
      }
      if (typeof isRead !== "boolean") {
        return reply.status(400).send({ error: "isRead must be a boolean" });
      }

      await db
        .update(messages)
        .set({ isRead })
        .where(
          and(eq(messages.inboxId, inboxId), inArray(messages.id, messageIds)),
        );

      await redisPub.publish(
        "read:changed",
        JSON.stringify({ inboxId, messageIds, isRead }),
      );

      return { success: true, updated: messageIds.length };
    },
  );
}
