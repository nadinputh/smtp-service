import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";

// ─── Queue Names ──────────────────────────────────────────
export const QUEUE_NAMES = {
  INCOMING_EMAIL: "incoming-email",
  OUTBOUND_EMAIL: "outbound-email",
  CLEANUP: "cleanup",
  WEBHOOK_DELIVERY: "webhook-delivery",
  QUOTA_RESET: "quota-reset",
} as const;

// ─── Job Payload Types ────────────────────────────────────
export interface IncomingEmailPayload {
  inboxId: string;
  rawKey: string; // MinIO object key for the .eml
  from: string;
  to: string[];
  size: number;
  receivedAt: string; // ISO timestamp
}

export interface OutboundEmailPayload {
  messageId: string;
  from: string;
  to: string[];
  rawKey: string;
}

export interface CleanupPayload {
  maxAgeHours: number;
}

export interface WebhookDeliveryPayload {
  webhookLogId: string;
  webhookId: string;
  url: string;
  event: string;
  payload: Record<string, unknown>;
  attempt: number;
}

export interface QuotaResetPayload {
  // no data needed — resets all overdue quotas
}

// ─── Connection Helper ────────────────────────────────────
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export function createRedisConnection(config: RedisConfig): ConnectionOptions {
  return {
    host: config.host,
    port: config.port,
    password: config.password || undefined,
  };
}

// ─── Queue Factories ──────────────────────────────────────
export function createIncomingQueue(connection: ConnectionOptions) {
  return new Queue<IncomingEmailPayload>(QUEUE_NAMES.INCOMING_EMAIL, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

export function createOutboundQueue(connection: ConnectionOptions) {
  return new Queue<OutboundEmailPayload>(QUEUE_NAMES.OUTBOUND_EMAIL, {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

export function createCleanupQueue(connection: ConnectionOptions) {
  return new Queue<CleanupPayload>(QUEUE_NAMES.CLEANUP, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
}

export function createWebhookDeliveryQueue(connection: ConnectionOptions) {
  return new Queue<WebhookDeliveryPayload>(QUEUE_NAMES.WEBHOOK_DELIVERY, {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 10000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}

export function createQuotaResetQueue(connection: ConnectionOptions) {
  return new Queue<QuotaResetPayload>(QUEUE_NAMES.QUOTA_RESET, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
}

// Re-export BullMQ types for convenience
export { Queue, Worker, type ConnectionOptions, type Job };
