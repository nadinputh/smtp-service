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
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { createHmac } from "node:crypto";
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

const MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * DNS lookup that refuses non-public addresses. The socket connects to the
 * address validated here, so a name that resolves differently on a second
 * lookup (DNS rebinding) can't slip past the check.
 */
const publicOnlyLookup = ((hostname: string, options: any, callback: any) => {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    const list: { address: string }[] = Array.isArray(address)
      ? address
      : [{ address: address as string }];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(new Error("Webhook target is not a public host"), "", 0);
    }
    callback(null, address, family);
  });
}) as typeof dns.lookup;

/** Literal-address and internal-name checks that DNS pinning doesn't cover. */
function assertPublicHost(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Webhook URL must use http or https");
  }
  const host = bareHost(url);
  if (isInternalHostname(host) || (isIP(host) && isPrivateAddress(host))) {
    throw new Error("Webhook target is not a public host");
  }
}

/**
 * POST a JSON body. Redirects are not followed (a 3xx counts as a failed
 * delivery) and only the first 64 KiB of the response is read.
 */
export async function postJson(
  rawUrl: string,
  body: string,
  headers: Record<string, string>,
  publicOnly: boolean,
): Promise<{ status: number; body: string }> {
  const url = new URL(rawUrl);
  if (publicOnly) assertPublicHost(url);
  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
        timeout: 10_000,
        ...(publicOnly ? { lookup: publicOnlyLookup } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        };
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= MAX_RESPONSE_BYTES) chunks.push(chunk);
          else {
            finish();
            res.destroy();
          }
        });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", finish);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Webhook request timed out")));
    req.on("error", reject);
    req.end(body);
  });
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
      const { webhookLogId, webhookId, url, event, payload, attempt } =
        job.data;

      try {
        const [hook] = await db
          .select({ secret: webhooks.secret })
          .from(webhooks)
          .where(eq(webhooks.id, webhookId))
          .limit(1);
        if (!hook) return; // webhook was deleted while the job waited

        const body = JSON.stringify(payload);
        const response = await postJson(
          url,
          body,
          {
            "Content-Type": "application/json",
            "X-MailPocket-Event": event,
            "X-MailPocket-Signature": `sha256=${createHmac("sha256", hook.secret).update(body).digest("hex")}`,
          },
          env.APP_MODE === "production",
        );
        const responseBody = response.body;

        if (response.status >= 200 && response.status < 300) {
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
