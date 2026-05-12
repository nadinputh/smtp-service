import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb, userQuotas, inboxes, messages } from "@mailpocket/db";
import { eq, count, sql } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { isGlobalAdmin } from "../middleware/access.js";

export function registerQuotaRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // ─── Get usage & limits ─────────────────────────────────
  app.get("/api/account/usage", { preHandler: authGuard }, async (request) => {
    const userId = request.user!.userId;

    // Get or create quota record
    let [quota] = await db
      .select()
      .from(userQuotas)
      .where(eq(userQuotas.userId, userId))
      .limit(1);

    if (!quota) {
      // Create default quota
      const nextReset = getNextMonthStart();
      [quota] = await db
        .insert(userQuotas)
        .values({
          userId,
          quotaResetAt: nextReset,
        })
        .returning();
    }

    // Count personally owned inboxes (for quota display)
    const [inboxCount] = await db
      .select({ count: count() })
      .from(inboxes)
      .where(eq(inboxes.userId, userId));

    // Count all accessible inboxes (owned + directly shared + via team)
    const accessibleResult = await db.execute(sql`
      SELECT COUNT(DISTINCT i.id)::int AS count
      FROM inboxes i
      LEFT JOIN inbox_members im ON im.inbox_id = i.id AND im.user_id = ${userId}
      LEFT JOIN team_members tm ON tm.team_id = i.team_id AND tm.user_id = ${userId}
      WHERE i.user_id = ${userId}
         OR im.user_id IS NOT NULL
         OR tm.user_id IS NOT NULL
    `);
    const accessibleInboxes = (accessibleResult.rows[0] as { count: number })
      .count;

    return {
      monthlySendLimit: quota.monthlySendLimit,
      currentMonthlySent: quota.currentMonthlySent,
      maxInboxes: quota.maxInboxes,
      currentInboxes: inboxCount.count,
      accessibleInboxes,
      maxMessagesPerInbox: quota.maxMessagesPerInbox,
      quotaResetAt: quota.quotaResetAt?.toISOString() ?? null,
    };
  });
}

function getNextMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
