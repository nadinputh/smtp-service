import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb } from "@mailpocket/db";
import { sql, type SQL } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import {
  BOUNCED_STATUSES,
  DAY,
  badPeriod,
  dayLabels,
  isMetric,
  overviewStats,
  parsePeriod,
  timeseries,
  windowStart,
} from "../lib/analytics.js";

/** Inboxes the user can access (owned, shared, or via team), as a subquery. */
function accessibleInboxes(userId: string): SQL {
  return sql`(
    SELECT i.id
    FROM inboxes i
    LEFT JOIN inbox_members im ON im.inbox_id = i.id AND im.user_id = ${userId}
    LEFT JOIN team_members tm ON tm.team_id = i.team_id AND tm.user_id = ${userId}
    WHERE i.user_id = ${userId}
       OR im.user_id IS NOT NULL
       OR tm.user_id IS NOT NULL
  )`;
}

export function registerAnalyticsRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // ─── Overview Stats ─────────────────────────────────────
  app.get<{ Querystring: { period?: string } }>(
    "/api/analytics/overview",
    { preHandler: authGuard },
    async (request, reply) => {
      const period = parsePeriod(request.query.period);
      if (!period) return badPeriod(reply);

      const inboxes = accessibleInboxes(request.user!.userId);
      return overviewStats(db, sql`inbox_id IN ${inboxes}`, period);
    },
  );

  // ─── Time Series ────────────────────────────────────────
  app.get<{ Querystring: { metric?: string; period?: string } }>(
    "/api/analytics/timeseries",
    { preHandler: authGuard },
    async (request, reply) => {
      const period = parsePeriod(request.query.period);
      if (!period) return badPeriod(reply);

      const metric = request.query.metric ?? "sent";
      if (!isMetric(metric)) {
        return reply.status(400).send({
          error: "metric must be sent, delivered, bounced or received",
        });
      }

      const inboxes = accessibleInboxes(request.user!.userId);
      return timeseries(db, sql`inbox_id IN ${inboxes}`, metric, period);
    },
  );

  // ─── Top Recipient Domains ──────────────────────────────
  app.get(
    "/api/analytics/top-recipients",
    { preHandler: authGuard },
    async (request) => {
      const result = await db.execute(sql`
        SELECT
          LOWER(SPLIT_PART(dl.recipient, '@', 2)) AS domain,
          COUNT(*)::int AS count
        FROM delivery_logs dl
        JOIN messages m ON m.id = dl.message_id
        WHERE m.inbox_id IN ${accessibleInboxes(request.user!.userId)}
          AND dl.recipient LIKE '%@%'
          AND dl.status <> 'suppressed'
        GROUP BY 1
        ORDER BY count DESC
        LIMIT 10
      `);

      return {
        domains: (result.rows as { domain: string; count: number }[]).map(
          (r) => ({ domain: r.domain, count: r.count }),
        ),
      };
    },
  );

  // ─── Bounce Rate Over Time ──────────────────────────────
  app.get<{ Querystring: { period?: string } }>(
    "/api/analytics/bounce-rate",
    { preHandler: authGuard },
    async (request, reply) => {
      const period = parsePeriod(request.query.period);
      if (!period) return badPeriod(reply);

      const since = windowStart(period.days);
      const result = await db.execute(sql`
        SELECT
          ${DAY} AS day,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status IN ${BOUNCED_STATUSES})::int AS bounced
        FROM messages
        WHERE inbox_id IN ${accessibleInboxes(request.user!.userId)}
          AND created_at >= ${since}
          AND status IN ('delivered','bounced','failed')
        GROUP BY 1
      `);
      const byDay = new Map(
        (result.rows as { day: string; total: number; bounced: number }[]).map(
          (r) => [r.day, r],
        ),
      );

      const labels = dayLabels(since, period.days);
      return {
        labels,
        values: labels.map((l) => {
          const row = byDay.get(l);
          return row && row.total > 0
            ? Math.round((row.bounced / row.total) * 100)
            : 0;
        }),
        period: period.key,
      };
    },
  );
}
