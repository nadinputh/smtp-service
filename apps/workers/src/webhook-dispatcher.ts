import { getDb, webhooks, webhookLogs, messages } from "@mailpocket/db";
import { eq, and } from "drizzle-orm";
import type Redis from "ioredis";
import type { Env } from "@mailpocket/env";
import {
  Worker,
  type ConnectionOptions,
  type Job,
  QUEUE_NAMES,
  type WebhookDeliveryPayload,
  isPrivateAddress,
  isInternalHostname,
  bareHost,
} from "@mailpocket/queue";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import type { Queue } from "bullmq";

interface WebhookEvent {
  event: string;
  messageId: string;
  recipient?: string;
  [key: string]: unknown;
}

export function startWebhookDispatcher(
  env: Env,
  db: ReturnType<typeof getDb>,
  redisSub: InstanceType<typeof Redis.default>,
  webhookQueue: Queue<WebhookDeliveryPayload>,
) {
  redisSub.subscribe("webhook:fire").catch((err: Error) => {
    console.error("Webhook Redis subscribe error:", err);
  });

  redisSub.on("message", async (_channel: string, raw: string) => {
    try {
      const event: WebhookEvent = JSON.parse(raw);
      await enqueueWebhooks(db, webhookQueue, event);
    } catch (err) {
      console.error("Webhook dispatch error:", err);
    }
  });

  console.log("🔔 Webhook dispatcher listening...");
}

async function enqueueWebhooks(
  db: ReturnType<typeof getDb>,
  webhookQueue: Queue<WebhookDeliveryPayload>,
  event: WebhookEvent,
) {
  const [msg] = await db
    .select({ inboxId: messages.inboxId })
    .from(messages)
    .where(eq(messages.id, event.messageId))
    .limit(1);

  if (!msg) return;

  const eventColumn =
    event.event === "delivered"
      ? webhooks.onDelivered
      : event.event === "bounced"
        ? webhooks.onBounced
        : event.event === "opened"
          ? webhooks.onOpened
          : event.event === "received"
            ? webhooks.onReceived
            : null;

  if (!eventColumn) return;

  const hooks = await db
    .select({ id: webhooks.id, url: webhooks.url })
    .from(webhooks)
    .where(
      and(
        eq(webhooks.inboxId, msg.inboxId),
        eq(webhooks.active, true),
        eq(eventColumn, true),
      ),
    );

  const payload = {
    event: event.event,
    timestamp: new Date().toISOString(),
    data: { ...event },
  };

  for (const hook of hooks) {
    // Create log row
    const [log] = await db
      .insert(webhookLogs)
      .values({
        webhookId: hook.id,
        event: event.event,
        payload,
        status: "pending",
        attempt: 1,
      })
      .returning({ id: webhookLogs.id });

    // Enqueue delivery job
    await webhookQueue.add("deliver", {
      webhookLogId: log.id,
      webhookId: hook.id,
      url: hook.url,
      event: event.event,
      payload,
      attempt: 1,
    });
  }
}

/**
 * In production, refuse to call into private networks. The host is resolved
 * here (not just checked syntactically) so a public-looking name that points
 * at an internal address is caught too.
 */
async function assertPublicTarget(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Webhook URL must use http or https");
  }
  const host = bareHost(url);
  if (isInternalHostname(host)) {
    throw new Error("Webhook target is not a public host");
  }
  const addresses = isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error("Webhook target is not a public host");
  }
}

export function createWebhookDeliveryWorker(
  connection: ConnectionOptions,
  db: ReturnType<typeof getDb>,
  webhookQueue: Queue<WebhookDeliveryPayload>,
  env: Pick<Env, "APP_MODE">,
) {
  return new Worker<WebhookDeliveryPayload>(
    QUEUE_NAMES.WEBHOOK_DELIVERY,
    async (job: Job<WebhookDeliveryPayload>) => {
      const { webhookLogId, url, event, payload, attempt } = job.data;

      try {
        if (env.APP_MODE === "production") await assertPublicTarget(url);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        // Redirects aren't followed: they could bounce a checked public URL
        // to an internal one. A 3xx therefore counts as a failed delivery.
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
          redirect: "manual",
        }).finally(() => clearTimeout(timeout));

        const responseBody = await response.text().catch(() => "");

        if (response.ok) {
          await db
            .update(webhookLogs)
            .set({
              status: "success",
              statusCode: response.status,
              responseBody: responseBody.slice(0, 2000),
              attempt,
            })
            .where(eq(webhookLogs.id, webhookLogId));

          console.log(`  🔔 Webhook delivered: ${event} → ${url}`);
        } else {
          throw new Error(
            `HTTP ${response.status}: ${responseBody.slice(0, 500)}`,
          );
        }
      } catch (err: any) {
        const maxAttempts = 5;
        const isLastAttempt = attempt >= maxAttempts;

        // Backoff delays: 10s, 30s, 2min, 10min, 1hr
        const delays = [10000, 30000, 120000, 600000, 3600000];
        const nextDelay = delays[attempt - 1] ?? 3600000;

        await db
          .update(webhookLogs)
          .set({
            status: isLastAttempt ? "failed" : "retrying",
            error: err.message,
            statusCode: err.message?.match(/HTTP (\d+)/)?.[1]
              ? parseInt(err.message.match(/HTTP (\d+)/)[1])
              : null,
            attempt,
            nextRetryAt: isLastAttempt
              ? null
              : new Date(Date.now() + nextDelay),
          })
          .where(eq(webhookLogs.id, webhookLogId));

        if (!isLastAttempt) {
          await webhookQueue.add(
            "deliver",
            { ...job.data, attempt: attempt + 1 },
            { delay: nextDelay },
          );
        }

        console.warn(
          `  ⚠️ Webhook ${isLastAttempt ? "failed" : "retrying"}: ${url} — ${err.message}`,
        );
      }
    },
    { connection, concurrency: 5 },
  );
}
