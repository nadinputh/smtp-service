import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb } from "@mailpocket/db";
import { sql } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import Redis from "ioredis";

export function registerSSERoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  app.get("/api/events", { preHandler: authGuard }, async (request, reply) => {
    const userId = request.user!.userId;

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

    request.raw.on("close", () => {
      clearInterval(refreshInterval);
      sub.unsubscribe();
      sub.disconnect();
    });
  });
}
