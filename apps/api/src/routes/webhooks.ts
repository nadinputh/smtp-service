import type { FastifyInstance } from "fastify";
import { getEnv } from "@smtp-service/env";
import { getDb, webhooks, webhookLogs, inboxes } from "@smtp-service/db";
import { eq, and, desc } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { requireInboxRole } from "../middleware/access.js";

export function registerWebhookRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // List webhooks for an inbox
  app.get<{ Params: { inboxId: string } }>(
    "/api/inboxes/:inboxId/webhooks",
    { preHandler: [authGuard, requireInboxRole("viewer")] },
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
    { preHandler: [authGuard, requireInboxRole("editor")] },
    async (request, reply) => {
      const { inboxId } = request.params;
      const { url, onDelivered, onBounced, onOpened, onReceived } =
        request.body;

      if (!url) {
        return reply.status(400).send({ error: "url is required" });
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        return reply.status(400).send({ error: "Invalid URL format" });
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
    { preHandler: [authGuard, requireInboxRole("editor")] },
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
    { preHandler: [authGuard, requireInboxRole("viewer")] },
    async (request, reply) => {
      const { inboxId, webhookId } = request.params;

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
    { preHandler: [authGuard, requireInboxRole("editor")] },
    async (request, reply) => {
      const { inboxId, webhookId, logId } = request.params;

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

      // Reset to pending and publish retry via Redis
      await db
        .update(webhookLogs)
        .set({ status: "pending", attempt: 1, nextRetryAt: null, error: null })
        .where(eq(webhookLogs.id, logId));

      // Get webhook URL
      const [hook] = await db
        .select({ url: webhooks.url })
        .from(webhooks)
        .where(eq(webhooks.id, webhookId))
        .limit(1);

      if (!hook) {
        return reply.status(404).send({ error: "Webhook not found" });
      }

      // Re-enqueue via the webhook delivery queue
      // We need external access to the queue — use Redis pub/sub to signal workers
      const { createWebhookDeliveryQueue, createRedisConnection } =
        await import("@smtp-service/queue");
      const conn = createRedisConnection({
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
      });
      const queue = createWebhookDeliveryQueue(conn);
      await queue.add("deliver", {
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
