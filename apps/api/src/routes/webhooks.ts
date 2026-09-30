import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb, webhooks, webhookLogs, inboxes } from "@mailpocket/db";
import { eq, and, desc } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { requireInboxRole, requireUuidParams } from "../middleware/access.js";
import {
  createWebhookDeliveryQueue,
  createRedisConnection,
  isPrivateAddress,
  isInternalHostname,
  bareHost,
} from "@mailpocket/queue";
import { isIP } from "node:net";

/**
 * Validate a webhook target. Always: http(s), no embedded credentials.
 * In production also refuse loopback/private/internal hosts so webhooks can't
 * be aimed at the server's own network (the worker re-checks after DNS).
 */
export function webhookUrlError(
  raw: unknown,
  production: boolean,
): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) {
    return "url must be a string of at most 2048 characters";
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Invalid URL format";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "url must use http or https";
  }
  if (url.username || url.password) {
    return "url must not contain credentials";
  }
  if (production) {
    const host = bareHost(url);
    if (isInternalHostname(host) || (isIP(host) && isPrivateAddress(host))) {
      return "url must point to a public host";
    }
  }
  return null;
}

export function registerWebhookRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);
  const production = env.APP_MODE === "production";
  const webhookQueue = createWebhookDeliveryQueue(
    createRedisConnection({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    }),
  );

  /** The webhook, only if it belongs to the inbox from the route. */
  async function findInboxWebhook(inboxId: string, webhookId: string) {
    const [hook] = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.inboxId, inboxId)))
      .limit(1);
    return hook;
  }

  // List webhooks for an inbox
  app.get<{ Params: { inboxId: string } }>(
    "/api/inboxes/:inboxId/webhooks",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("viewer")] },
    async (request, reply) => {
      const { inboxId } = request.params;

      return await db
        .select()
        .from(webhooks)
        .where(eq(webhooks.inboxId, inboxId));
    },
  );

  // Create a webhook
  app.post<{
    Params: { inboxId: string };
    Body: {
      url: string;
      onDelivered?: boolean;
      onBounced?: boolean;
      onOpened?: boolean;
      onReceived?: boolean;
    };
  }>(
    "/api/inboxes/:inboxId/webhooks",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("editor")] },
    async (request, reply) => {
      const { inboxId } = request.params;
      const { url, onDelivered, onBounced, onOpened, onReceived } =
        request.body ?? {};

      const urlError = webhookUrlError(url, production);
      if (urlError) {
        return reply.status(400).send({ error: urlError });
      }
      const flags = [onDelivered, onBounced, onOpened, onReceived];
      if (flags.some((f) => f !== undefined && typeof f !== "boolean")) {
        return reply
          .status(400)
          .send({ error: "Event flags must be booleans" });
      }

      const [webhook] = await db
        .insert(webhooks)
        .values({
          inboxId,
          url,
          onDelivered: onDelivered ?? true,
          onBounced: onBounced ?? true,
          onOpened: onOpened ?? false,
          onReceived: onReceived ?? true,
        })
        .returning();

      return reply.status(201).send(webhook);
    },
  );

  // Delete a webhook
  app.delete<{ Params: { inboxId: string; webhookId: string } }>(
    "/api/inboxes/:inboxId/webhooks/:webhookId",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("editor")] },
    async (request, reply) => {
      const { inboxId, webhookId } = request.params;

      const [deleted] = await db
        .delete(webhooks)
        .where(and(eq(webhooks.id, webhookId), eq(webhooks.inboxId, inboxId)))
        .returning({ id: webhooks.id });

      if (!deleted) {
        return reply.status(404).send({ error: "Webhook not found" });
      }
      return { success: true };
    },
  );

  // List webhook delivery logs
  app.get<{ Params: { inboxId: string; webhookId: string } }>(
    "/api/inboxes/:inboxId/webhooks/:webhookId/logs",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("viewer")] },
    async (request, reply) => {
      const { inboxId, webhookId } = request.params;

      if (!(await findInboxWebhook(inboxId, webhookId))) {
        return reply.status(404).send({ error: "Webhook not found" });
      }

      return await db
        .select()
        .from(webhookLogs)
        .where(eq(webhookLogs.webhookId, webhookId))
        .orderBy(desc(webhookLogs.createdAt))
        .limit(50);
    },
  );

  // Retry a failed webhook delivery
  app.post<{
    Params: { inboxId: string; webhookId: string; logId: string };
  }>(
    "/api/inboxes/:inboxId/webhooks/:webhookId/logs/:logId/retry",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("editor")] },
    async (request, reply) => {
      const { inboxId, webhookId, logId } = request.params;

      const hook = await findInboxWebhook(inboxId, webhookId);
      if (!hook) {
        return reply.status(404).send({ error: "Webhook not found" });
      }

      const [log] = await db
        .select()
        .from(webhookLogs)
        .where(
          and(eq(webhookLogs.id, logId), eq(webhookLogs.webhookId, webhookId)),
        )
        .limit(1);

      if (!log) {
        return reply.status(404).send({ error: "Webhook log not found" });
      }

      // Reset to pending and re-enqueue delivery
      await db
        .update(webhookLogs)
        .set({ status: "pending", attempt: 1, nextRetryAt: null, error: null })
        .where(eq(webhookLogs.id, logId));

      await webhookQueue.add("deliver", {
        webhookLogId: logId,
        webhookId,
        url: hook.url,
        event: log.event,
        payload: log.payload as Record<string, unknown>,
        attempt: 1,
      });

      return { success: true };
    },
  );
}
