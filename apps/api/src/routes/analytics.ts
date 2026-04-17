import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb, messages, deliveryLogs, inboxes } from "@mailpocket/db";
import { eq, and, gte, sql, count } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";

/** Get all inbox IDs the user can access (owned, shared, team) */
async function getAccessibleInboxIds(
  db: any,
  userId: string,
): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT i.id
    FROM inboxes i
    LEFT JOIN inbox_members im ON im.inbox_id = i.id AND im.user_id = ${userId}
    LEFT JOIN team_members tm ON tm.team_id = i.team_id AND tm.user_id = ${userId}
    WHERE i.user_id = ${userId}
       OR im.user_id IS NOT NULL
       OR tm.user_id IS NOT NULL
  `);
  return (result.rows as { id: string }[]).map((r) => r.id);
}

export function registerAnalyticsRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // ─── Overview Stats ─────────────────────────────────────
  app.get<{ Querystring: { period?: string } }>(
    "/api/analytics/overview",
    { preHandler: authGuard },
    async (request) => {
      const userId = request.user!.userId;
      const period = request.query.period ?? "30d";
      const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Get user's accessible inbox IDs
      const inboxIds = await getAccessibleInboxIds(db, userId);

      if (inboxIds.length === 0) {
        return {
          totalSent: 0,
          totalDelivered: 0,
          totalBounced: 0,
          totalReceived: 0,
          deliveryRate: 0,
          bounceRate: 0,
        };
      }

      const inboxList = inboxIds.map((id) => `'${id}'`).join(",");

      // All-time counts by status
      const allTimeResult = await db.execute(sql`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status IN ('queued','sending','delivered','bounced','failed'))::text AS sent,
          COUNT(*) FILTER (WHERE status = 'delivered')::text AS delivered,
          COUNT(*) FILTER (WHERE status = 'bounced' OR status = 'failed')::text AS bounced,
          COUNT(*) FILTER (WHERE status = 'received')::text AS received
        FROM messages
        WHERE inbox_id IN (${sql.raw(inboxList)})
      `);
      const allTime = allTimeResult.rows[0] as {
        total: string;
        sent: string;
        delivered: string;
        bounced: string;
        received: string;
      };

      // Period counts
      const periodResult = await db.execute(sql`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status IN ('queued','sending','delivered','bounced','failed'))::text AS sent,
          COUNT(*) FILTER (WHERE status = 'delivered')::text AS delivered,
          COUNT(*) FILTER (WHERE status = 'bounced' OR status = 'failed')::text AS bounced,
          COUNT(*) FILTER (WHERE status = 'received')::text AS received
        FROM messages
        WHERE inbox_id IN (${sql.raw(inboxList)})
          AND created_at >= ${since}
      `);
      const periodStats = periodResult.rows[0] as {
        total: string;
        sent: string;
        delivered: string;
        bounced: string;
        received: string;
      };

      const totalSent = parseInt(allTime.sent, 10);
      const totalDelivered = parseInt(allTime.delivered, 10);
      const totalBounced = parseInt(allTime.bounced, 10);

      return {
        totalMessages: parseInt(allTime.total, 10),
        totalSent,
        totalDelivered,
        totalBounced,
        totalReceived: parseInt(allTime.received, 10),
        deliveryRate:
          totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
        bounceRate:
          totalSent > 0 ? Math.round((totalBounced / totalSent) * 100) : 0,
        period: {
          days,
          total: parseInt(periodStats.total, 10),
          sent: parseInt(periodStats.sent, 10),
          delivered: parseInt(periodStats.delivered, 10),
          bounced: parseInt(periodStats.bounced, 10),
          received: parseInt(periodStats.received, 10),
        },
      };
    },
  );

  // ─── Time Series ────────────────────────────────────────
  app.get<{ Querystring: { metric?: string; period?: string } }>(
    "/api/analytics/timeseries",
    { preHandler: authGuard },
    async (request) => {
      const userId = request.user!.userId;
      const metric = request.query.metric ?? "sent";
      const period = request.query.period ?? "30d";
      const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const userInboxIds = await getAccessibleInboxIds(db, userId);

      if (userInboxIds.length === 0) {
        return { labels: [], values: [] };
      }

      const inboxList = userInboxIds.map((id) => `'${id}'`).join(",");

      // Map metric to SQL filter
      let statusFilter: string;
      switch (metric) {
        case "delivered":
          statusFilter = `AND status = 'delivered'`;
          break;
        case "bounced":
          statusFilter = `AND (status = 'bounced' OR status = 'failed')`;
          break;
        case "received":
          statusFilter = `AND status = 'received'`;
          break;
        case "sent":
        default:
          statusFilter = `AND status IN ('queued','sending','delivered','bounced','failed')`;
          break;
      }

      const timeseriesResult = await db.execute(sql`
        SELECT
          TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
          COUNT(*)::text AS count
        FROM messages
        WHERE inbox_id IN (${sql.raw(inboxList)})
          AND created_at >= ${since}
          ${sql.raw(statusFilter)}
        GROUP BY created_at::date
        ORDER BY created_at::date ASC
      `);
      const tsRows = timeseriesResult.rows as { day: string; count: string }[];

      // Fill in missing days with 0
      const dataMap = new Map<string, number>();
      for (const row of tsRows) {
        dataMap.set(row.day, parseInt(row.count, 10));
      }

      const labels: string[] = [];
      const values: number[] = [];
      for (let d = 0; d < days; d++) {
        const date = new Date(since.getTime() + d * 24 * 60 * 60 * 1000);
        const key = date.toISOString().slice(0, 10);
        labels.push(key);
        values.push(dataMap.get(key) ?? 0);
      }

      return { labels, values, metric, period };
    },
  );

  // ─── Top Recipient Domains ──────────────────────────────
  app.get(
    "/api/analytics/top-recipients",
    { preHandler: authGuard },
    async (request) => {
      const userId = request.user!.userId;

      const recipientInboxIds = await getAccessibleInboxIds(db, userId);

      if (recipientInboxIds.length === 0) {
        return { domains: [] };
      }

      const inboxList = recipientInboxIds.map((id) => `'${id}'`).join(",");

      const recipientResult = await db.execute(sql`
        SELECT
          SPLIT_PART(recipient, '@', 2) AS domain,
          COUNT(*)::text AS count
        FROM delivery_logs dl
        JOIN messages m ON m.id = dl.message_id
        WHERE m.inbox_id IN (${sql.raw(inboxList)})
          AND dl.recipient LIKE '%@%'
        GROUP BY SPLIT_PART(recipient, '@', 2)
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `);
      const recipientRows = recipientResult.rows as {
        domain: string;
        count: string;
      }[];

      return {
        domains: recipientRows.map((r) => ({
          domain: r.domain,
          count: parseInt(r.count, 10),
        })),
      };
    },
  );

  // ─── Bounce Rate Over Time ──────────────────────────────
  app.get<{ Querystring: { period?: string } }>(
    "/api/analytics/bounce-rate",
    { preHandler: authGuard },
    async (request) => {
      const userId = request.user!.userId;
      const period = request.query.period ?? "30d";
      const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const bounceInboxIds = await getAccessibleInboxIds(db, userId);

      if (bounceInboxIds.length === 0) {
        return { labels: [], values: [] };
      }

      const inboxList = bounceInboxIds.map((id) => `'${id}'`).join(",");

      const bounceResult = await db.execute(sql`
        SELECT
          TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE status = 'bounced' OR status = 'failed')::text AS bounced
        FROM messages
        WHERE inbox_id IN (${sql.raw(inboxList)})
          AND created_at >= ${since}
          AND status IN ('delivered','bounced','failed')
        GROUP BY created_at::date
        ORDER BY created_at::date ASC
      `);
      const bounceRows = bounceResult.rows as {
        day: string;
        total: string;
        bounced: string;
      }[];

      const dataMap = new Map<string, { total: number; bounced: number }>();
      for (const row of bounceRows) {
        dataMap.set(row.day, {
          total: parseInt(row.total, 10),
          bounced: parseInt(row.bounced, 10),
        });
      }

      const labels: string[] = [];
      const values: number[] = [];
      for (let d = 0; d < days; d++) {
        const date = new Date(since.getTime() + d * 24 * 60 * 60 * 1000);
        const key = date.toISOString().slice(0, 10);
        labels.push(key);
        const data = dataMap.get(key);
        if (data && data.total > 0) {
          values.push(Math.round((data.bounced / data.total) * 100));
        } else {
          values.push(0);
        }
      }

      return { labels, values, period };
    },
  );
}
