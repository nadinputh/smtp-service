import { suppressions, type getDb } from "@mailpocket/db";
import { and, eq, inArray } from "drizzle-orm";

/** Normalized emails from `emails` that `userId` has suppressed. */
export async function findSuppressed(
  db: ReturnType<typeof getDb>,
  userId: string,
  emails: string[],
): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const rows = await db
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(
      and(eq(suppressions.userId, userId), inArray(suppressions.email, emails)),
    );
  return new Set(rows.map((r) => r.email));
}
