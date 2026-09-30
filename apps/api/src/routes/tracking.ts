import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb, deliveryLogs, messages } from "@mailpocket/db";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import { authGuard } from "../middleware/auth.js";
import {
  requireMessageRole,
  requireUuidParams,
  isUuid,
} from "../middleware/access.js";
import { verifyTrackedLink } from "@mailpocket/queue";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function registerTrackingRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);
  const redisPub = new Redis.default({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
  });

  // Click tracking: redirect through tracked link
  app.get<{
    Params: { messageId: string };
    Querystring: { url: string; sig?: string };
  }>("/t/click/:messageId", async (request, reply) => {
    const { messageId } = request.params;
    const { url, sig } = request.query;

    if (typeof url !== "string" || !url) {
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
    if (isUuid(messageId)) {
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
    }

    // Only links we signed when sending redirect straight through. Anything
    // else (forged or from before signing existed) gets a confirmation page,
    // so this endpoint can't be used to disguise a phishing link.
    if (verifyTrackedLink(env.JWT_SECRET, messageId, url, sig)) {
      return reply.redirect(targetUrl.href);
    }
    const shown = escapeHtml(targetUrl.href);
    return reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header("X-Robots-Tag", "noindex")
      .send(
        `<!doctype html><meta charset="utf-8"><title>Leaving MailPocket</title>` +
          `<p>You are about to open an external link:</p>` +
          `<p><a rel="noopener noreferrer nofollow" href="${shown}">${shown}</a></p>`,
      );
  });

  // Open tracking: 1x1 transparent pixel
  app.get<{ Params: { messageId: string } }>(
    "/t/open/:messageId",
    async (request, reply) => {
      const { messageId } = request.params;

      // Fire opened webhook
      if (isUuid(messageId)) {
        redisPub
          .publish(
            "webhook:fire",
            JSON.stringify({ event: "opened", messageId }),
          )
          .catch(() => {});
      }

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
    {
      preHandler: [authGuard, requireUuidParams, requireMessageRole("viewer")],
    },
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
