import type { FastifyInstance } from "fastify";
import { getEnv } from "@smtp-service/env";
import { getDb, deliveryLogs, messages } from "@smtp-service/db";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import { authGuard } from "../middleware/auth.js";
import { requireMessageRole } from "../middleware/access.js";

export function registerTrackingRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);
  const redisPub = new Redis.default({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
  });

  // Click tracking: redirect through tracked link
  app.get<{ Params: { messageId: string }; Querystring: { url: string } }>(
    "/t/click/:messageId",
    async (request, reply) => {
      const { messageId } = request.params;
      const { url } = request.query;

      if (!url) {
        return reply.status(400).send("Missing url parameter");
      }

      // Validate the URL to prevent open redirects
      let targetUrl: URL;
      try {
        targetUrl = new URL(url);
        if (!["http:", "https:"].includes(targetUrl.protocol)) {
          return reply.status(400).send("Invalid URL protocol");
        }
      } catch {
        return reply.status(400).send("Invalid URL");
      }

      // Log the click event asynchronously
      redisPub
        .publish(
          "webhook:fire",
          JSON.stringify({
            event: "clicked",
            messageId,
            url: targetUrl.href,
          }),
        )
        .catch(() => {});

      return reply.redirect(targetUrl.href);
    },
  );

  // Open tracking: 1x1 transparent pixel
  app.get<{ Params: { messageId: string } }>(
    "/t/open/:messageId",
    async (request, reply) => {
      const { messageId } = request.params;

      // Fire opened webhook
      redisPub
        .publish("webhook:fire", JSON.stringify({ event: "opened", messageId }))
        .catch(() => {});

      // Return 1x1 transparent GIF
      const pixel = Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      );
      reply.header("Content-Type", "image/gif");
      reply.header("Cache-Control", "no-store, no-cache, must-revalidate");
      return reply.send(pixel);
    },
  );

  // Delivery logs for a message (authenticated)
  app.get<{ Params: { messageId: string } }>(
    "/api/messages/:messageId/delivery",
    { preHandler: [authGuard, requireMessageRole("viewer")] },
    async (request, reply) => {
      const { messageId } = request.params;

      const logs = await db
        .select()
        .from(deliveryLogs)
        .where(eq(deliveryLogs.messageId, messageId));

      return logs;
    },
  );
}
