import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
import { Worker, type Job } from "bullmq";
import { simpleParser, type ParsedMail } from "mailparser";
import { getEnv } from "@mailpocket/env";
import { getDb, messages, userQuotas } from "@mailpocket/db";
import { lt, lte } from "drizzle-orm";
import { createStorage } from "@mailpocket/storage";
import {
  QUEUE_NAMES,
  createRedisConnection,
  createCleanupQueue,
  createQuotaResetQueue,
  createWebhookDeliveryQueue,
  type IncomingEmailPayload,
  type OutboundEmailPayload,
  type CleanupPayload,
  type QuotaResetPayload,
} from "@mailpocket/queue";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { createOutboundProcessor } from "./outbound.js";
import {
  startWebhookDispatcher,
  createWebhookDeliveryWorker,
} from "./webhook-dispatcher.js";
import { scoreEmail } from "./spam-scorer.js";

const env = getEnv();

// ─── Initialize dependencies ─────────────────────────────
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
const redisConnection = createRedisConnection({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
});
const redisPub = new Redis.default({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
});

// ─── Incoming Email Worker ────────────────────────────────
async function processIncomingEmail(job: Job<IncomingEmailPayload>) {
  const { inboxId, rawKey, from, to, size } = job.data;

  console.log(`Processing incoming email: ${rawKey}`);

  // 1. Download the raw .eml from MinIO
  const rawBuffer = await storage.getObjectAsBuffer(rawKey);

  // 2. Parse the MIME content
  const parsed: ParsedMail = await simpleParser(rawBuffer);

  // 2b. Run spam analysis
  const spamResult = scoreEmail(parsed, rawBuffer.toString("utf-8"), from);

  // 3. Upload attachments to MinIO
  const attachmentRefs: {
    filename: string;
    contentType: string;
    size: number;
    storageKey: string;
  }[] = [];

  if (parsed.attachments?.length) {
    for (const att of parsed.attachments) {
      const attKey = `attachments/${inboxId}/${randomUUID()}/${att.filename ?? "unnamed"}`;
      await storage.putObject(attKey, att.content, att.size, att.contentType);
      attachmentRefs.push({
        filename: att.filename ?? "unnamed",
        contentType: att.contentType,
        size: att.size,
        storageKey: attKey,
      });
    }
  }

  // 4. Save parsed metadata to PostgreSQL
  const [saved] = await db
    .insert(messages)
    .values({
      inboxId,
      from: parsed.from?.text ?? from,
      to: parsed.to
        ? Array.isArray(parsed.to)
          ? parsed.to.map((a) => a.text)
          : [parsed.to.text]
        : to,
      cc: parsed.cc
        ? Array.isArray(parsed.cc)
          ? parsed.cc.map((a) => a.text)
          : [parsed.cc.text]
        : null,
      subject: parsed.subject ?? null,
      date: parsed.date ?? null,
      html: parsed.html || null,
      text: parsed.text ?? null,
      rawKey,
      attachments: attachmentRefs.length > 0 ? attachmentRefs : null,
      size,
      status: "received",
      spamScore: spamResult.score,
      spamRules: spamResult.rules.length > 0 ? spamResult.rules : null,
    })
    .returning({ id: messages.id });

  // 5. Publish real-time event via Redis pub/sub
  await redisPub.publish(
    "email:new",
    JSON.stringify({
      inboxId,
      subject: parsed.subject ?? null,
      from: parsed.from?.text ?? from,
    }),
  );

  // 6. Fire "received" webhook event
  await redisPub.publish(
    "webhook:fire",
    JSON.stringify({
      event: "received",
      messageId: saved.id,
      inboxId,
      subject: parsed.subject ?? null,
      from: parsed.from?.text ?? from,
    }),
  );

  console.log(
    `✅ Email processed and saved: ${parsed.subject ?? "(no subject)"}`,
  );
}

// ─── Start Worker ─────────────────────────────────────────
const incomingWorker = new Worker<IncomingEmailPayload>(
  QUEUE_NAMES.INCOMING_EMAIL,
  processIncomingEmail,
  {
    connection: redisConnection,
    concurrency: 5,
  },
);

incomingWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

incomingWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

// ─── Outbound Email Worker ────────────────────────────────
const processOutbound = createOutboundProcessor(env, db, storage, redisPub);

const outboundWorker = new Worker<OutboundEmailPayload>(
  QUEUE_NAMES.OUTBOUND_EMAIL,
  processOutbound,
  {
    connection: redisConnection,
    concurrency: 3,
  },
);

outboundWorker.on("completed", (job) => {
  console.log(`Outbound job ${job.id} completed`);
});

outboundWorker.on("failed", (job, err) => {
  console.error(`Outbound job ${job?.id} failed:`, err.message);
});

console.log("⚙️  Workers started — waiting for jobs...");

// ─── Webhook Dispatcher ───────────────────────────────────
const redisWebhookSub = new Redis.default({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
});
const webhookQueue = createWebhookDeliveryQueue(redisConnection);
startWebhookDispatcher(env, db, redisWebhookSub, webhookQueue);
createWebhookDeliveryWorker(redisConnection, db, webhookQueue);

// ─── Cleanup Worker ───────────────────────────────────────
async function processCleanup(job: Job<CleanupPayload>) {
  const { maxAgeHours } = job.data;
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  console.log(
    `🧹 Cleaning up messages older than ${maxAgeHours}h (before ${cutoff.toISOString()})`,
  );

  // Fetch messages older than cutoff
  const oldMessages = await db
    .select({
      id: messages.id,
      rawKey: messages.rawKey,
      attachments: messages.attachments,
    })
    .from(messages)
    .where(lt(messages.createdAt, cutoff));

  if (oldMessages.length === 0) {
    console.log("🧹 No messages to clean up");
    return;
  }

  // Collect all storage keys to remove
  const storageKeys: string[] = [];
  for (const msg of oldMessages) {
    storageKeys.push(msg.rawKey);
    if (msg.attachments) {
      for (const att of msg.attachments) {
        storageKeys.push(att.storageKey);
      }
    }
  }

  // Delete from MinIO
  await storage.removeObjects(storageKeys);

  // Delete from PostgreSQL (cascade will handle related records)
  await db.delete(messages).where(lt(messages.createdAt, cutoff));

  console.log(
    `🧹 Cleaned up ${oldMessages.length} messages, ${storageKeys.length} storage objects`,
  );
}

const cleanupWorker = new Worker<CleanupPayload>(
  QUEUE_NAMES.CLEANUP,
  processCleanup,
  {
    connection: redisConnection,
    concurrency: 1,
  },
);

cleanupWorker.on("completed", (job) => {
  console.log(`Cleanup job ${job.id} completed`);
});

cleanupWorker.on("failed", (job, err) => {
  console.error(`Cleanup job ${job?.id} failed:`, err.message);
});

// Schedule repeatable cleanup job
const cleanupQueue = createCleanupQueue(redisConnection);
await cleanupQueue.add(
  "auto-cleanup",
  { maxAgeHours: env.CLEANUP_MAX_AGE_HOURS },
  { repeat: { every: 60 * 60 * 1000 } }, // Run every hour
);

// ─── Quota Reset Worker ───────────────────────────────────
async function processQuotaReset(_job: Job<QuotaResetPayload>) {
  const now = new Date();
  console.log(`📊 Running quota reset check at ${now.toISOString()}`);

  const overdue = await db
    .select({ id: userQuotas.id, userId: userQuotas.userId })
    .from(userQuotas)
    .where(lte(userQuotas.quotaResetAt, now));

  if (overdue.length === 0) {
    console.log("📊 No quotas to reset");
    return;
  }

  for (const row of overdue) {
    const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await db
      .update(userQuotas)
      .set({ currentMonthlySent: 0, quotaResetAt: nextReset })
      .where(lte(userQuotas.quotaResetAt, now));
  }

  console.log(`📊 Reset quotas for ${overdue.length} user(s)`);
}

const quotaResetWorker = new Worker<QuotaResetPayload>(
  QUEUE_NAMES.QUOTA_RESET,
  processQuotaReset,
  {
    connection: redisConnection,
    concurrency: 1,
  },
);

quotaResetWorker.on("completed", (job) => {
  console.log(`Quota reset job ${job.id} completed`);
});

quotaResetWorker.on("failed", (job, err) => {
  console.error(`Quota reset job ${job?.id} failed:`, err.message);
});

// Schedule repeatable quota reset job — run daily at midnight
const quotaResetQueue = createQuotaResetQueue(redisConnection);
await quotaResetQueue.add(
  "auto-quota-reset",
  {},
  { repeat: { every: 24 * 60 * 60 * 1000 } }, // Run every 24 hours
);

// ─── Graceful Shutdown ────────────────────────────────────
async function shutdown() {
  console.log("Shutting down workers...");
  await Promise.all([
    incomingWorker.close(),
    outboundWorker.close(),
    cleanupWorker.close(),
    quotaResetWorker.close(),
  ]);
  redisWebhookSub.disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
