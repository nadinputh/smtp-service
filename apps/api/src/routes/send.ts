import type { FastifyInstance } from "fastify";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { getEnv } from "@mailpocket/env";
import {
  getDb,
  inboxes,
  messages,
  templates,
  suppressions,
  userQuotas,
} from "@mailpocket/db";
import { createStorage } from "@mailpocket/storage";
import {
  createOutboundQueue,
  createRedisConnection,
  type OutboundEmailPayload,
} from "@mailpocket/queue";
import { eq, and, lte, sql } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { resolveInboxRole, hasMinRole } from "../middleware/access.js";
import {
  normalizeEmail,
  parseRecipients,
  splitAddressList,
  type ParsedRecipient,
} from "../lib/address.js";
import { findSuppressed } from "../lib/suppression.js";

interface SendBody {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  inboxId: string;
  sendAt?: string; // ISO 8601 for scheduled send
  headers?: Record<string, string>; // Custom X-* headers
  templateId?: string;
  variables?: Record<string, string>;
}

interface BatchSendBody {
  from: string;
  subject: string;
  inboxId: string;
  templateId?: string;
  html?: string;
  text?: string;
  recipients: Array<{
    to: string;
    variables?: Record<string, string>;
  }>;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Replace {{var}} placeholders. Only own, scalar values are substituted;
 * unknown keys stay as-is. Pass `html` to escape values for an HTML body so
 * recipient-supplied data can't inject markup.
 */
export function substituteVariables(
  content: string,
  vars: Record<string, unknown>,
  html = false,
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = Object.hasOwn(vars, key) ? vars[key] : undefined;
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      return match;
    }
    const str = String(value);
    return html ? str.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]) : str;
  });
}

/** A variables payload must be a plain object. */
function isVariablesObject(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "object" && value !== null && !Array.isArray(value))
  );
}

/** Extract variable names from template content */
function extractVariables(content: string): string[] {
  const matches = content.matchAll(/\{\{(\w+)\}\}/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

/** Validate that custom headers only contain X-* keys */
function validateCustomHeaders(headers: Record<string, string>): string | null {
  for (const key of Object.keys(headers)) {
    if (!key.startsWith("X-") && !key.startsWith("x-")) {
      return `Custom header "${key}" is not allowed. Only X-* headers are permitted.`;
    }
  }
  return null;
}

export function registerSendRoutes(app: FastifyInstance) {
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

  // ─── JSON Send ──────────────────────────────────────────
  app.post<{ Body: SendBody }>(
    "/v1/messages",
    {
      preHandler: authGuard,
      config: { rateLimit: { max: 30, timeWindow: 60000 } },
    },
    async (request, reply) => {
      const {
        from,
        to,
        cc,
        bcc,
        subject: rawSubject,
        text: rawText,
        html: rawHtml,
        inboxId,
        sendAt,
        headers: customHeaders,
        templateId,
        variables,
      } = request.body;

      if (!from || !to || !inboxId) {
        return reply
          .status(400)
          .send({ error: "from, to, and inboxId are required" });
      }

      if (!isVariablesObject(variables)) {
        return reply.status(400).send({ error: "variables must be an object" });
      }

      const toEntries = parseRecipients(to);
      const ccEntries = cc ? parseRecipients(cc) : undefined;
      const bccEntries = bcc ? parseRecipients(bcc) : undefined;
      if (
        !normalizeEmail(from) ||
        !toEntries ||
        ccEntries === null ||
        bccEntries === null
      ) {
        return reply.status(400).send({
          error: "from, to, cc, and bcc must be valid email addresses",
        });
      }

      // Verify inbox access (editor or above can send)
      const inboxRole = await resolveInboxRole(request.user!.userId, inboxId);
      if (!hasMinRole(inboxRole, "editor")) {
        return reply.status(404).send({ error: "Inbox not found" });
      }

      // Resolve template if provided
      let subject = rawSubject;
      let text = rawText;
      let html = rawHtml;

      if (templateId) {
        const [tpl] = await db
          .select()
          .from(templates)
          .where(
            and(
              eq(templates.id, templateId),
              eq(templates.userId, request.user!.userId),
            ),
          )
          .limit(1);

        if (!tpl) {
          return reply.status(404).send({ error: "Template not found" });
        }

        const vars = variables ?? {};
        subject = subject ?? substituteVariables(tpl.subject ?? "", vars);
        html = substituteVariables(tpl.html, vars, true);
        text = tpl.text ? substituteVariables(tpl.text, vars) : text;
      }

      if (!subject) {
        return reply.status(400).send({ error: "subject is required" });
      }

      if (!text && !html) {
        return reply
          .status(400)
          .send({ error: "At least one of text or html is required" });
      }

      // Validate custom headers
      if (customHeaders) {
        const headerError = validateCustomHeaders(customHeaders);
        if (headerError) {
          return reply.status(400).send({ error: headerError });
        }
      }

      // Validate sendAt
      let delay: number | undefined;
      if (sendAt) {
        const sendDate = new Date(sendAt);
        if (isNaN(sendDate.getTime())) {
          return reply
            .status(400)
            .send({ error: "sendAt must be a valid ISO 8601 timestamp" });
        }
        const now = Date.now();
        if (sendDate.getTime() <= now) {
          return reply
            .status(400)
            .send({ error: "sendAt must be in the future" });
        }
        delay = sendDate.getTime() - now;
      }

      // Check suppression list
      const suppressedEmails = await findSuppressed(
        db,
        request.user!.userId,
        [...toEntries, ...(ccEntries ?? []), ...(bccEntries ?? [])].map(
          (r) => r.email,
        ),
      );
      const isActive = (r: ParsedRecipient) => !suppressedEmails.has(r.email);
      const activeTo = toEntries.filter(isActive);

      if (activeTo.length === 0) {
        return reply.status(422).send({
          error: "All recipients are suppressed",
          suppressedEmails: [...suppressedEmails],
        });
      }

      // Everyone who actually receives the message: to + cc + bcc.
      const activeCc = ccEntries?.filter(isActive) ?? [];
      const activeBcc = bccEntries?.filter(isActive) ?? [];
      const envelopeTo = [
        ...new Set(
          [...activeTo, ...activeCc, ...activeBcc].map((r) => r.email),
        ),
      ];

      const quotaError = await checkAndIncrementQuota(
        db,
        request.user!.userId,
        envelopeTo.length,
      );
      if (quotaError) {
        return reply.status(429).send({ error: quotaError });
      }

      // Build MIME message
      const mailOpts: Record<string, unknown> = {
        from,
        to: activeTo.map((r) => r.raw).join(", "),
        cc: activeCc.map((r) => r.raw).join(", ") || undefined,
        bcc: activeBcc.map((r) => r.raw).join(", ") || undefined,
        subject,
        text,
        html,
      };

      // Inject custom X-* headers
      if (customHeaders) {
        mailOpts.headers = customHeaders;
      }

      const mail = new MailComposer(mailOpts);

      const rawBuffer = await new Promise<Buffer>((resolve, reject) => {
        mail.compile().build((err: Error | null, message: Buffer) => {
          if (err) reject(err);
          else resolve(message);
        });
      });

      // Store raw .eml in MinIO
      const messageId = randomUUID();
      const rawKey = `outbound/${messageId}.eml`;

      await storage.putObject(
        rawKey,
        Readable.from(rawBuffer),
        rawBuffer.length,
      );

      // Insert message record
      const messageStatus = delay ? "scheduled" : "queued";
      await db.insert(messages).values({
        id: messageId,
        inboxId,
        from,
        to: activeTo.map((r) => r.email),
        cc: activeCc.length ? activeCc.map((r) => r.email) : null,
        bcc: activeBcc.length ? activeBcc.map((r) => r.email) : null,
        subject,
        text: text ?? null,
        html: html ?? null,
        rawKey,
        size: rawBuffer.length,
        status: messageStatus,
        customHeaders: customHeaders ?? null,
        sendAt: sendAt ? new Date(sendAt) : null,
      });

      // Enqueue for delivery
      const payload: OutboundEmailPayload = {
        messageId,
        userId: request.user!.userId,
        from,
        to: envelopeTo,
        rawKey,
      };

      await outboundQueue.add("send", payload, {
        jobId: messageId,
        ...(delay ? { delay } : {}),
      });

      return reply.status(202).send({
        id: messageId,
        status: messageStatus,
        message: delay
          ? `Message scheduled for delivery at ${sendAt}`
          : "Message queued for delivery",
        ...(suppressedEmails.size > 0
          ? { suppressed: [...suppressedEmails] }
          : {}),
      });
    },
  );

  // ─── Multipart Send (with attachments) ─────────────────
  app.post(
    "/v1/messages/mime",
    {
      preHandler: authGuard,
      config: { rateLimit: { max: 30, timeWindow: 60000 } },
    },
    async (request, reply) => {
      const parts = request.parts();

      const fields: Record<string, string> = {};
      const attachments: Array<{
        filename: string;
        content: Buffer;
        contentType: string;
      }> = [];

      for await (const part of parts) {
        if (part.type === "field") {
          fields[part.fieldname] = part.value as string;
        } else if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          attachments.push({
            filename: part.filename ?? "attachment",
            content: Buffer.concat(chunks),
            contentType: part.mimetype ?? "application/octet-stream",
          });
        }
      }

      const { from, to, cc, bcc, subject, text, html, inboxId } = fields;

      if (!from || !to || !subject || !inboxId) {
        return reply
          .status(400)
          .send({ error: "from, to, subject, and inboxId are required" });
      }

      // Verify inbox access (editor or above can send)
      const mimeInboxRole = await resolveInboxRole(
        request.user!.userId,
        inboxId,
      );
      if (!hasMinRole(mimeInboxRole, "editor")) {
        return reply.status(404).send({ error: "Inbox not found" });
      }

      const toEntries = parseRecipients(splitAddressList(to));
      const ccEntries = cc ? parseRecipients(splitAddressList(cc)) : undefined;
      const bccEntries = bcc
        ? parseRecipients(splitAddressList(bcc))
        : undefined;
      if (
        !normalizeEmail(from) ||
        !toEntries ||
        ccEntries === null ||
        bccEntries === null
      ) {
        return reply.status(400).send({
          error: "from, to, cc, and bcc must be valid email addresses",
        });
      }

      const suppressedEmails = await findSuppressed(
        db,
        request.user!.userId,
        [...toEntries, ...(ccEntries ?? []), ...(bccEntries ?? [])].map(
          (r) => r.email,
        ),
      );
      const isActive = (r: ParsedRecipient) => !suppressedEmails.has(r.email);
      const activeTo = toEntries.filter(isActive);

      if (activeTo.length === 0) {
        return reply.status(422).send({
          error: "All recipients are suppressed",
          suppressedEmails: [...suppressedEmails],
        });
      }

      if (!text && !html) {
        return reply
          .status(400)
          .send({ error: "At least one of text or html is required" });
      }

      // Everyone who actually receives the message: to + cc + bcc.
      const activeCc = ccEntries?.filter(isActive) ?? [];
      const activeBcc = bccEntries?.filter(isActive) ?? [];
      const envelopeTo = [
        ...new Set(
          [...activeTo, ...activeCc, ...activeBcc].map((r) => r.email),
        ),
      ];

      const quotaError = await checkAndIncrementQuota(
        db,
        request.user!.userId,
        envelopeTo.length,
      );
      if (quotaError) {
        return reply.status(429).send({ error: quotaError });
      }

      // Build MIME with attachments
      const mail = new MailComposer({
        from,
        to: activeTo.map((r) => r.raw).join(", "),
        cc: activeCc.map((r) => r.raw).join(", ") || undefined,
        bcc: activeBcc.map((r) => r.raw).join(", ") || undefined,
        subject,
        text,
        html,
        attachments: attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });

      const rawBuffer = await new Promise<Buffer>((resolve, reject) => {
        mail.compile().build((err: Error | null, message: Buffer) => {
          if (err) reject(err);
          else resolve(message);
        });
      });

      const messageId = randomUUID();
      const rawKey = `outbound/${messageId}.eml`;

      await storage.putObject(
        rawKey,
        Readable.from(rawBuffer),
        rawBuffer.length,
      );

      // Insert message record (needed for delivery_logs FK)
      await db.insert(messages).values({
        id: messageId,
        inboxId,
        from,
        to: activeTo.map((r) => r.email),
        cc: activeCc.length ? activeCc.map((r) => r.email) : null,
        bcc: activeBcc.length ? activeBcc.map((r) => r.email) : null,
        subject,
        text: text ?? null,
        html: html ?? null,
        rawKey,
        size: rawBuffer.length,
        status: "queued",
      });

      const payload: OutboundEmailPayload = {
        messageId,
        userId: request.user!.userId,
        from,
        to: envelopeTo,
        rawKey,
      };

      await outboundQueue.add("send", payload, {
        jobId: messageId,
      });

      return reply.status(202).send({
        id: messageId,
        status: "queued",
        message: "Message queued for delivery",
        ...(suppressedEmails.size > 0
          ? { suppressed: [...suppressedEmails] }
          : {}),
      });
    },
  );

  // ─── Batch Send ─────────────────────────────────────────
  app.post<{ Body: BatchSendBody }>(
    "/v1/messages/batch",
    {
      preHandler: authGuard,
      config: { rateLimit: { max: 10, timeWindow: 60000 } },
    },
    async (request, reply) => {
      const {
        from,
        subject: rawSubject,
        inboxId,
        templateId,
        html: rawHtml,
        text: rawText,
        recipients,
      } = request.body;

      if (
        !from ||
        !inboxId ||
        !Array.isArray(recipients) ||
        !recipients.length
      ) {
        return reply
          .status(400)
          .send({ error: "from, inboxId, and recipients are required" });
      }

      if (recipients.length > 1000) {
        return reply
          .status(400)
          .send({ error: "Maximum 1000 recipients per batch" });
      }

      const batch: Array<{
        raw: string;
        email: string;
        variables?: Record<string, string>;
      }> = [];
      for (const r of recipients) {
        const email = normalizeEmail(r?.to);
        if (!email || !isVariablesObject(r.variables)) {
          return reply.status(400).send({
            error:
              "Every recipient needs a valid email address and object variables",
          });
        }
        batch.push({ raw: r.to.trim(), email, variables: r.variables });
      }
      if (!normalizeEmail(from)) {
        return reply
          .status(400)
          .send({ error: "from must be a valid email address" });
      }

      // Verify inbox access (editor or above can send)
      const batchInboxRole = await resolveInboxRole(
        request.user!.userId,
        inboxId,
      );
      if (!hasMinRole(batchInboxRole, "editor")) {
        return reply.status(404).send({ error: "Inbox not found" });
      }

      // Resolve template if provided
      let tpl: {
        subject: string | null;
        html: string;
        text: string | null;
      } | null = null;
      if (templateId) {
        const [found] = await db
          .select()
          .from(templates)
          .where(
            and(
              eq(templates.id, templateId),
              eq(templates.userId, request.user!.userId),
            ),
          )
          .limit(1);

        if (!found) {
          return reply.status(404).send({ error: "Template not found" });
        }
        tpl = found;
      }

      if (!tpl && !rawSubject) {
        return reply
          .status(400)
          .send({ error: "subject is required when not using a template" });
      }

      if (!tpl && !rawHtml && !rawText) {
        return reply.status(400).send({
          error: "html or text is required when not using a template",
        });
      }

      // Check suppression list for all recipients
      const suppressedEmails = await findSuppressed(
        db,
        request.user!.userId,
        batch.map((r) => r.email),
      );

      const activeCount = batch.filter(
        (r) => !suppressedEmails.has(r.email),
      ).length;
      if (activeCount > 0) {
        const quotaError = await checkAndIncrementQuota(
          db,
          request.user!.userId,
          activeCount,
        );
        if (quotaError) {
          return reply.status(429).send({ error: quotaError });
        }
      }

      const batchId = randomUUID();
      const messageIds: string[] = [];
      const suppressed: string[] = [];

      for (const recipient of batch) {
        if (suppressedEmails.has(recipient.email)) {
          suppressed.push(recipient.email);
          continue;
        }

        const vars = recipient.variables ?? {};
        const subject = tpl
          ? substituteVariables(tpl.subject ?? rawSubject ?? "", vars)
          : substituteVariables(rawSubject ?? "", vars);
        const html = tpl
          ? substituteVariables(tpl.html, vars, true)
          : rawHtml
            ? substituteVariables(rawHtml, vars, true)
            : undefined;
        const text = tpl?.text
          ? substituteVariables(tpl.text, vars)
          : rawText
            ? substituteVariables(rawText, vars)
            : undefined;

        const mail = new MailComposer({
          from,
          to: recipient.raw,
          subject,
          text,
          html,
        });

        const rawBuffer = await new Promise<Buffer>((resolve, reject) => {
          mail.compile().build((err: Error | null, msg: Buffer) => {
            if (err) reject(err);
            else resolve(msg);
          });
        });

        const messageId = randomUUID();
        const rawKey = `outbound/${messageId}.eml`;

        await storage.putObject(
          rawKey,
          Readable.from(rawBuffer),
          rawBuffer.length,
        );

        await db.insert(messages).values({
          id: messageId,
          inboxId,
          from,
          to: [recipient.email],
          subject,
          text: text ?? null,
          html: html ?? null,
          rawKey,
          size: rawBuffer.length,
          status: "queued",
        });

        await outboundQueue.add(
          "send",
          {
            messageId,
            userId: request.user!.userId,
            from,
            to: [recipient.email],
            rawKey,
          } satisfies OutboundEmailPayload,
          {
            jobId: messageId,
          },
        );

        messageIds.push(messageId);
      }

      return reply.status(202).send({
        batchId,
        messageIds,
        count: messageIds.length,
        ...(suppressed.length > 0 ? { suppressed } : {}),
      });
    },
  );
}

// ─── Quota Helper ─────────────────────────────────────────
/**
 * Atomically consume `count` sends from the user's monthly quota. The check
 * and increment are one UPDATE so concurrent requests can't both slip under
 * the limit. Returns an error message when the quota would be exceeded.
 */
async function checkAndIncrementQuota(
  db: ReturnType<typeof getDb>,
  userId: string,
  count: number,
): Promise<string | null> {
  const now = new Date();
  const nextReset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  await db
    .insert(userQuotas)
    .values({ userId, quotaResetAt: nextReset })
    .onConflictDoNothing();

  // New month: start counting again
  await db
    .update(userQuotas)
    .set({ currentMonthlySent: 0, quotaResetAt: nextReset })
    .where(
      and(eq(userQuotas.userId, userId), lte(userQuotas.quotaResetAt, now)),
    );

  const [consumed] = await db
    .update(userQuotas)
    .set({
      currentMonthlySent: sql`${userQuotas.currentMonthlySent} + ${count}`,
    })
    .where(
      and(
        eq(userQuotas.userId, userId),
        sql`${userQuotas.currentMonthlySent} + ${count} <= ${userQuotas.monthlySendLimit}`,
      ),
    )
    .returning({ id: userQuotas.id });
  if (consumed) return null;

  const [quota] = await db
    .select()
    .from(userQuotas)
    .where(eq(userQuotas.userId, userId))
    .limit(1);
  return `Monthly send quota exceeded. Used ${quota.currentMonthlySent}/${quota.monthlySendLimit}. Resets at ${quota.quotaResetAt?.toISOString() ?? "next month"}`;
}
