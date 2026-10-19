import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb } from "@mailpocket/db";
import { sql } from "drizzle-orm";
import { authGuard, isSessionActive } from "../middleware/auth.js";
import { apiKeys } from "@mailpocket/db";
import { eq } from "drizzle-orm";
import Redis from "ioredis";

/** Each stream holds a Redis connection, so one user may only open a few. */
const MAX_STREAMS_PER_USER = 5;
const openStreams = new Map<string, number>();

export function registerSSERoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  app.get("/api/events", { preHandler: authGuard }, async (request, reply) => {
    const userId = request.user!.userId;

    const open = openStreams.get(userId) ?? 0;
    if (open >= MAX_STREAMS_PER_USER) {
      return reply.status(429).send({ error: "Too many open event streams" });
    }
    openStreams.set(userId, open + 1);

    // Load inbox IDs the user has access to
    const accessibleInboxes = await db.execute(sql`
        SELECT DISTINCT i.id
        FROM inboxes i
        LEFT JOIN inbox_members im ON im.inbox_id = i.id AND im.user_id = ${userId}
        LEFT JOIN team_members tm ON tm.team_id = i.team_id AND tm.user_id = ${userId}
        WHERE i.user_id = ${userId}
           OR im.user_id IS NOT NULL
           OR tm.user_id IS NOT NULL
      `);
    const allowedIds = new Set(accessibleInboxes.rows.map((r: any) => r.id));

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const sub = new Redis.default({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
    });

    sub.subscribe("email:new", "read:changed").catch((err: Error) => {
      request.log.error({ err }, "SSE Redis subscribe error");
    });

    sub.on("message", (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);
        // Only forward events for inboxes the user can access
        if (data.inboxId && !allowedIds.has(data.inboxId)) return;
        reply.raw.write(`event: ${channel}\ndata: ${message}\n\n`);
      } catch {
        // skip malformed messages
      }
    });

    // Refresh allowed inbox IDs periodically (handles new shares/teams)
    const refreshInterval = setInterval(async () => {
      try {
        // End the stream once its session or API key stops being valid
        // (logout, password change, key revoked)
        const stillValid = request.apiKeyId
          ? (
              await db
                .select({ expiresAt: apiKeys.expiresAt })
                .from(apiKeys)
                .where(eq(apiKeys.id, request.apiKeyId))
                .limit(1)
            ).some((k) => !k.expiresAt || k.expiresAt > new Date())
          : request.user!.iat === undefined ||
            (await isSessionActive(request.user!));
        if (!stillValid) {
          reply.raw.end();
          return;
        }

        const fresh = await db.execute(sql`
            SELECT DISTINCT i.id
            FROM inboxes i
            LEFT JOIN inbox_members im ON im.inbox_id = i.id AND im.user_id = ${userId}
            LEFT JOIN team_members tm ON tm.team_id = i.team_id AND tm.user_id = ${userId}
            WHERE i.user_id = ${userId}
               OR im.user_id IS NOT NULL
               OR tm.user_id IS NOT NULL
          `);
        allowedIds.clear();
        for (const r of fresh.rows) allowedIds.add((r as any).id);
      } catch {
        // keep existing set on error
      }
    }, 60_000);

    // Keepalive: send a comment every 25 s so proxies don't close idle connections
    const heartbeatInterval = setInterval(() => {
      reply.raw.write(":ping\n\n");
    }, 25_000);

    request.raw.on("close", () => {
      const left = (openStreams.get(userId) ?? 1) - 1;
      if (left > 0) openStreams.set(userId, left);
      else openStreams.delete(userId);
      clearInterval(refreshInterval);
      clearInterval(heartbeatInterval);
      sub.unsubscribe();
      sub.disconnect();
    });
  });
}
