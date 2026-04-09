import type { FastifyInstance } from "fastify";
import { getEnv } from "@smtp-service/env";
import { getDb, userQuotas, inboxes, messages } from "@smtp-service/db";
import { eq, count } from "drizzle-orm";
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

    // Count current inboxes
    const [inboxCount] = await db
      .select({ count: count() })
      .from(inboxes)
      .where(eq(inboxes.userId, userId));

    return {
      monthlySendLimit: quota.monthlySendLimit,
      currentMonthlySent: quota.currentMonthlySent,
      maxInboxes: quota.maxInboxes,
      currentInboxes: inboxCount.count,
      maxMessagesPerInbox: quota.maxMessagesPerInbox,
      quotaResetAt: quota.quotaResetAt?.toISOString() ?? null,
    };
  });
}

function getNextMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
