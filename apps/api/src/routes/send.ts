import type { FastifyInstance } from "fastify";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { getEnv } from "@smtp-service/env";
import {
  getDb,
  inboxes,
  messages,
  templates,
  suppressions,
  userQuotas,
} from "@smtp-service/db";
import { createStorage } from "@smtp-service/storage";
import {
  createOutboundQueue,
  createRedisConnection,
  type OutboundEmailPayload,
} from "@smtp-service/queue";
import { eq, and, inArray } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { resolveInboxRole, hasMinRole } from "../middleware/access.js";

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

/** Replace {{var}} placeholders in a string */
function substituteVariables(
  content: string,
  vars: Record<string, string>,
): string {
  return content.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => vars[key] ?? `{{${key}}}`,
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

      // Verify inbox access (editor or above can send)
      const inboxRole = await resolveInboxRole(request.user!.userId, inboxId);
      if (!hasMinRole(inboxRole, "editor")) {
        return reply.status(404).send({ error: "Inbox not found" });
      }

      // ─── Quota check ─────────────────────────────────────
      const recipients = Array.isArray(to) ? to : [to];
      const quotaError = await checkAndIncrementQuota(
        db,
        request.user!.userId,
        recipients.length,
      );
      if (quotaError) {
        return reply.status(429).send({ error: quotaError });
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
        html = substituteVariables(tpl.html, vars);
        text = tpl.text ? substituteVariables(tpl.text, vars) : text;
      }

      if (!subject) {
        return reply.status(400).send({ error: "subject is required" });
      }

      const toList = Array.isArray(to) ? to : [to];
      const ccList = cc ? (Array.isArray(cc) ? cc : [cc]) : undefined;
      const bccList = bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined;

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
      const allRecipients = [...toList, ...(ccList ?? []), ...(bccList ?? [])];
      const suppressedRows = await db
        .select({ email: suppressions.email })
        .from(suppressions)
        .where(
          and(
            eq(suppressions.userId, request.user!.userId),
            inArray(suppressions.email, allRecipients),
          ),
        );
      const suppressedEmails = new Set(suppressedRows.map((r) => r.email));
      const activeToList = toList.filter((e) => !suppressedEmails.has(e));

      if (activeToList.length === 0) {
        return reply.status(422).send({
          error: "All recipients are suppressed",
          suppressedEmails: [...suppressedEmails],
        });
      }

      // Build MIME message
      const mailOpts: Record<string, unknown> = {
        from,
        to: activeToList.join(", "),
        cc: ccList?.filter((e) => !suppressedEmails.has(e)).join(", "),
        bcc: bccList?.filter((e) => !suppressedEmails.has(e)).join(", "),
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
        to: activeToList,
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
        from,
        to: activeToList,
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

      const toList = to.split(",").map((s) => s.trim());
      const ccList = cc ? cc.split(",").map((s) => s.trim()) : undefined;
      const bccList = bcc ? bcc.split(",").map((s) => s.trim()) : undefined;

      if (!text && !html) {
        return reply
          .status(400)
          .send({ error: "At least one of text or html is required" });
      }

      // Build MIME with attachments
      const mail = new MailComposer({
        from,
        to: toList.join(", "),
        cc: ccList?.join(", "),
        bcc: bccList?.join(", "),
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
        to: toList,
        subject,
        text: text ?? null,
        html: html ?? null,
        rawKey,
        size: rawBuffer.length,
        status: "queued",
      });

      const payload: OutboundEmailPayload = {
        messageId,
        from,
        to: toList,
        rawKey,
      };

      await outboundQueue.add("send", payload, {
        jobId: messageId,
      });

      return reply.status(202).send({
        id: messageId,
        status: "queued",
        message: "Message queued for delivery",
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

      if (!from || !inboxId || !recipients?.length) {
        return reply
          .status(400)
          .send({ error: "from, inboxId, and recipients are required" });
      }

      if (recipients.length > 1000) {
        return reply
          .status(400)
          .send({ error: "Maximum 1000 recipients per batch" });
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
      const allEmails = recipients.map((r) => r.to);
      const suppressedRows = await db
        .select({ email: suppressions.email })
        .from(suppressions)
        .where(
          and(
            eq(suppressions.userId, request.user!.userId),
            inArray(suppressions.email, allEmails),
          ),
        );
      const suppressedEmails = new Set(suppressedRows.map((r) => r.email));

      const batchId = randomUUID();
      const messageIds: string[] = [];
      const suppressed: string[] = [];

      for (const recipient of recipients) {
        if (suppressedEmails.has(recipient.to)) {
          suppressed.push(recipient.to);
          continue;
        }

        const vars = recipient.variables ?? {};
        const subject = tpl
          ? substituteVariables(tpl.subject ?? rawSubject ?? "", vars)
          : substituteVariables(rawSubject ?? "", vars);
        const html = tpl
          ? substituteVariables(tpl.html, vars)
          : rawHtml
            ? substituteVariables(rawHtml, vars)
            : undefined;
        const text = tpl?.text
          ? substituteVariables(tpl.text, vars)
          : rawText
            ? substituteVariables(rawText, vars)
            : undefined;

        const mail = new MailComposer({
          from,
          to: recipient.to,
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
          to: [recipient.to],
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
            from,
            to: [recipient.to],
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
async function checkAndIncrementQuota(
  db: any,
  userId: string,
  recipientCount: number,
): Promise<string | null> {
  // Get or create quota record
  let [quota] = await db
    .select()
    .from(userQuotas)
    .where(eq(userQuotas.userId, userId))
    .limit(1);

  if (!quota) {
    const nextReset = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
    );
    [quota] = await db
      .insert(userQuotas)
      .values({ userId, quotaResetAt: nextReset })
      .returning();
  }

  // Check reset
  if (quota.quotaResetAt && new Date(quota.quotaResetAt) <= new Date()) {
    const nextReset = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
    );
    await db
      .update(userQuotas)
      .set({ currentMonthlySent: 0, quotaResetAt: nextReset })
      .where(eq(userQuotas.userId, userId));
    quota.currentMonthlySent = 0;
  }

  if (quota.currentMonthlySent + recipientCount > quota.monthlySendLimit) {
    return `Monthly send quota exceeded. Used ${quota.currentMonthlySent}/${quota.monthlySendLimit}. Resets at ${quota.quotaResetAt?.toISOString() ?? "next month"}`;
  }

  // Increment
  await db
    .update(userQuotas)
    .set({
      currentMonthlySent: quota.currentMonthlySent + recipientCount,
    })
    .where(eq(userQuotas.userId, userId));

  return null;
}
