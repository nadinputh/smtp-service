import type { FastifyReply } from "fastify";
import type { getDb } from "@mailpocket/db";
import { sql, type SQL } from "drizzle-orm";

type Db = ReturnType<typeof getDb>;

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

const SENT_STATUSES = sql`('queued','sending','delivered','bounced','failed')`;
export const BOUNCED_STATUSES = sql`('bounced','failed')`;

const METRIC_FILTERS: Record<string, SQL> = {
  sent: sql`status IN ${SENT_STATUSES}`,
  delivered: sql`status = 'delivered'`,
  bounced: sql`status IN ${BOUNCED_STATUSES}`,
  received: sql`status = 'received'`,
};

export const DAY = sql`TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

export interface Period {
  key: string;
  days: number;
}

/** Validate ?period; undefined means the 30d default, unknown values are null. */
export function parsePeriod(raw: unknown): Period | null {
  const key = raw === undefined ? "30d" : String(raw);
  return Object.hasOwn(PERIOD_DAYS, key)
    ? { key, days: PERIOD_DAYS[key] }
    : null;
}

export function badPeriod(reply: FastifyReply) {
  return reply.status(400).send({ error: "period must be 7d, 30d or 90d" });
}

export function isMetric(value: unknown): value is string {
  return typeof value === "string" && Object.hasOwn(METRIC_FILTERS, value);
}

/** Start of the UTC day `days - 1` days ago, so the window ends with today. */
export function windowStart(days: number): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return new Date(today.getTime() - (days - 1) * DAY_MS);
}

export function dayLabels(since: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) =>
    new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10),
  );
}

interface Counts {
  total: number;
  sent: number;
  delivered: number;
  bounced: number;
  received: number;
}

/**
 * Message totals for the messages matching `scope` (a SQL predicate on the
 * messages table). Rates are of messages that reached a final outcome, so
 * messages still queued or sending don't drag the delivery rate down.
 */
export async function overviewStats(db: Db, scope: SQL, period: Period) {
  const since = windowStart(period.days);
  const counts = (extra: SQL) => sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status IN ${SENT_STATUSES})::int AS sent,
      COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE status IN ${BOUNCED_STATUSES})::int AS bounced,
      COUNT(*) FILTER (WHERE status = 'received')::int AS received
    FROM messages
    WHERE ${scope} ${extra}`;

  const [allTimeResult, periodResult] = await Promise.all([
    db.execute(counts(sql``)),
    db.execute(counts(sql`AND created_at >= ${since}`)),
  ]);
  const allTime = allTimeResult.rows[0] as unknown as Counts;
  const periodStats = periodResult.rows[0] as unknown as Counts;

  const settled = allTime.delivered + allTime.bounced;
  const pct = (n: number) =>
    settled > 0 ? Math.round((n / settled) * 100) : 0;

  return {
    totalMessages: allTime.total,
    totalSent: allTime.sent,
    totalDelivered: allTime.delivered,
    totalBounced: allTime.bounced,
    totalReceived: allTime.received,
    deliveryRate: pct(allTime.delivered),
    bounceRate: pct(allTime.bounced),
    period: { days: period.days, ...periodStats },
  };
}

/** Daily counts of `metric` over the period, ending today (UTC). */
export async function timeseries(
  db: Db,
  scope: SQL,
  metric: string,
  period: Period,
) {
  const since = windowStart(period.days);
  const result = await db.execute(sql`
    SELECT ${DAY} AS day, COUNT(*)::int AS count
    FROM messages
    WHERE ${scope}
      AND created_at >= ${since}
      AND ${METRIC_FILTERS[metric]}
    GROUP BY 1
  `);
  const byDay = new Map(
    (result.rows as unknown as { day: string; count: number }[]).map((r) => [
      r.day,
      r.count,
    ]),
  );
  const labels = dayLabels(since, period.days);
  return {
    labels,
    values: labels.map((l) => byDay.get(l) ?? 0),
    metric,
    period: period.key,
  };
}
