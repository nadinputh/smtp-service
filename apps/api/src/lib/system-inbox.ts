import { randomBytes } from "node:crypto";
import { eq, asc } from "drizzle-orm";
import { getDb, inboxes, users } from "@mailpocket/db";

const SYSTEM_INBOX_SMTP_USERNAME = "system-notifications";

/**
 * The inbox that system-generated emails (password resets, and any future
 * transactional mail) are sent "from". Outbound delivery in this app is
 * always attributed to a real inbox (messages.inboxId is a required FK), so
 * system mail needs one too rather than bypassing that model. Owned by the
 * oldest admin account since there's no dedicated system user concept.
 */
export async function getOrCreateSystemInbox(
  db: ReturnType<typeof getDb>,
): Promise<{ id: string }> {
  const [existing] = await db
    .select({ id: inboxes.id })
    .from(inboxes)
    .where(eq(inboxes.smtpUsername, SYSTEM_INBOX_SMTP_USERNAME))
    .limit(1);
  if (existing) return existing;

  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.createdAt))
    .limit(1);
  if (!owner) {
    throw new Error("Cannot create system inbox: no admin user exists");
  }

  const [created] = await db
    .insert(inboxes)
    .values({
      userId: owner.id,
      name: "System Notifications",
      smtpUsername: SYSTEM_INBOX_SMTP_USERNAME,
      smtpPassword: randomBytes(16).toString("hex"),
    })
    .returning({ id: inboxes.id });

  return created;
}
