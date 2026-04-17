import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb, messages, inboxes } from "@mailpocket/db";
import { createStorage } from "@mailpocket/storage";
import { eq, desc, and, ilike, gte, lte, sql, count } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { requireInboxRole, requireMessageRole } from "../middleware/access.js";
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
    };
  }>(
    "/api/inboxes/:id/messages",
    { preHandler: [authGuard, requireInboxRole("viewer")] },
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
      } = request.query;

      const page = Math.max(1, parseInt(pageStr, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(limitStr, 10) || 50));
      const offset = (page - 1) * limit;

      // Build filter conditions
      const conditions = [eq(messages.inboxId, id)];

      if (q) {
        const pattern = `%${q}%`;
        conditions.push(
          sql`(${messages.subject} ILIKE ${pattern} OR ${messages.from} ILIKE ${pattern} OR ${messages.to}::text ILIKE ${pattern})`,
        );
      }
      if (fromFilter) {
        conditions.push(ilike(messages.from, `%${fromFilter}%`));
      }
      if (toFilter) {
        conditions.push(
          sql`${messages.to}::text ILIKE ${"%" + toFilter + "%"}`,
        );
      }
      if (statusFilter) {
        conditions.push(eq(messages.status, statusFilter));
      }
      if (after) {
        conditions.push(gte(messages.createdAt, new Date(after)));
      }
      if (before) {
        conditions.push(lte(messages.createdAt, new Date(before)));
      }

      const where = and(...conditions);

      const [totalResult] = await db
        .select({ count: count() })
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
        })
        .from(messages)
        .where(where)
        .orderBy(desc(messages.createdAt))
        .limit(limit)
        .offset(offset);

      return { messages: result, total: totalResult.count, page, limit };
    },
  );

  // Get a single message with full details
  app.get<{ Params: { id: string } }>(
    "/api/messages/:id",
    { preHandler: [authGuard, requireMessageRole("viewer")] },
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
    { preHandler: [authGuard, requireMessageRole("viewer")] },
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
    { preHandler: [authGuard, requireMessageRole("viewer")] },
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
    { preHandler: [authGuard, requireMessageRole("viewer")] },
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
        const strValue =
          typeof value === "string"
            ? value
            : typeof value === "object" && value !== null && "text" in value
              ? (value as any).text
              : JSON.stringify(value);
        allHeaders.push({ key, value: strValue });
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
    { preHandler: [authGuard, requireMessageRole("viewer")] },
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
        return reply
          .status(200)
          .send({
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
    { preHandler: [authGuard, requireMessageRole("editor")] },
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

      // Remove raw .eml from storage
      await storage.removeObject(message.rawKey);

      // Remove attachments from storage
      if (message.attachments) {
        for (const att of message.attachments) {
          await storage.removeObject(att.storageKey);
        }
      }

      // Delete from DB
      await db.delete(messages).where(eq(messages.id, id));

      return { success: true };
    },
  );

  // Delete all messages in an inbox
  app.delete<{ Params: { id: string } }>(
    "/api/inboxes/:id/messages",
    { preHandler: [authGuard, requireInboxRole("editor")] },
    async (request, reply) => {
      const { id } = request.params;

      // Fetch all messages to clean up storage
      const inboxMessages = await db
        .select({
          id: messages.id,
          rawKey: messages.rawKey,
          attachments: messages.attachments,
        })
        .from(messages)
        .where(eq(messages.inboxId, id));

      // Remove storage objects
      for (const msg of inboxMessages) {
        await storage.removeObject(msg.rawKey);
        if (msg.attachments) {
          for (const att of msg.attachments) {
            await storage.removeObject(att.storageKey);
          }
        }
      }

      // Delete all messages from DB
      await db.delete(messages).where(eq(messages.inboxId, id));

      return { success: true, deleted: inboxMessages.length };
    },
  );

  // ─── Forward a message ──────────────────────────────────
  app.post<{ Params: { id: string }; Body: { to: string } }>(
    "/api/messages/:id/forward",
    { preHandler: [authGuard, requireMessageRole("editor")] },
    async (request, reply) => {
      const { id } = request.params;
      const { to } = request.body;

      if (!to) {
        return reply.status(400).send({ error: "to is required" });
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
      const fromAddr = `forwarded@${env.API_HOST !== "0.0.0.0" ? env.API_HOST : "mailpocket.local"}`;
      const fwdSubject = `[Fwd] ${message.subject ?? "(no subject)"}`;

      const mail = new MailComposer({
        from: fromAddr,
        to,
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
        to: [to],
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
        from: fromAddr,
        to: [to],
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

  // ─── Cancel a scheduled message ─────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/api/messages/:id/schedule",
    { preHandler: [authGuard, requireMessageRole("editor")] },
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
        await job.remove();
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
    { preHandler: [authGuard, requireMessageRole("viewer")] },
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
      reply.header("Content-Type", att.contentType);
      reply.header(
        "Content-Disposition",
        `inline; filename="${att.filename.replace(/"/g, '\\"')}"`,
      );
      return reply.send(stream);
    },
  );

  // ─── Mark a single message as read ─────────────────────
  app.put<{ Params: { id: string } }>(
    "/api/messages/:id/read",
    { preHandler: [authGuard, requireMessageRole("viewer")] },
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
        JSON.stringify({ inboxId: message.inboxId }),
      );

      return { success: true };
    },
  );

  // ─── Mark a single message as unread ───────────────────
  app.delete<{ Params: { id: string } }>(
    "/api/messages/:id/read",
    { preHandler: [authGuard, requireMessageRole("viewer")] },
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
        JSON.stringify({ inboxId: message.inboxId }),
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
    { preHandler: [authGuard, requireInboxRole("viewer")] },
    async (request, reply) => {
      const { id: inboxId } = request.params;
      const { messageIds, isRead } = request.body;

      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return reply
          .status(400)
          .send({ error: "messageIds array is required" });
      }

      await db
        .update(messages)
        .set({ isRead })
        .where(
          and(
            eq(messages.inboxId, inboxId),
            sql`${messages.id} = ANY(${messageIds})`,
          ),
        );

      await redisPub.publish("read:changed", JSON.stringify({ inboxId }));

      return { success: true, updated: messageIds.length };
    },
  );
}
