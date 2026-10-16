import { getDb, userQuotas } from "@mailpocket/db";
import { eq, and, lte, sql } from "drizzle-orm";

/**
 * Atomically consume `count` sends from the user's monthly quota. The check
 * and increment are one UPDATE so concurrent requests can't both slip under
 * the limit. Returns an error message when the quota would be exceeded.
 */
export async function checkAndIncrementQuota(
  db: ReturnType<typeof getDb>,
  userId: string,
  count: number,
): Promise<string | null> {
  const now = new Date();
  const nextReset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  await db
    .insert(userQuotas)
    .values({ userId, quotaResetAt: nextReset })
    .onConflictDoNothing();

  // New month: start counting again
  await db
    .update(userQuotas)
    .set({ currentMonthlySent: 0, quotaResetAt: nextReset })
    .where(
      and(eq(userQuotas.userId, userId), lte(userQuotas.quotaResetAt, now)),
    );

  const [consumed] = await db
    .update(userQuotas)
    .set({
      currentMonthlySent: sql`${userQuotas.currentMonthlySent} + ${count}`,
    })
    .where(
      and(
        eq(userQuotas.userId, userId),
        sql`${userQuotas.currentMonthlySent} + ${count} <= ${userQuotas.monthlySendLimit}`,
      ),
    )
    .returning({ id: userQuotas.id });
  if (consumed) return null;

  const [quota] = await db
    .select()
    .from(userQuotas)
    .where(eq(userQuotas.userId, userId))
    .limit(1);
  return `Monthly send quota exceeded. Used ${quota.currentMonthlySent}/${quota.monthlySendLimit}. Resets at ${quota.quotaResetAt?.toISOString() ?? "next month"}`;
}
