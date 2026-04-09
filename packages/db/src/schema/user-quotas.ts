import { pgTable, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const userQuotas = pgTable("user_quotas", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  monthlySendLimit: integer("monthly_send_limit").notNull().default(1000),
  maxInboxes: integer("max_inboxes").notNull().default(10),
  maxMessagesPerInbox: integer("max_messages_per_inbox")
    .notNull()
    .default(5000),
  currentMonthlySent: integer("current_monthly_sent").notNull().default(0),
  quotaResetAt: timestamp("quota_reset_at", { withTimezone: true }),
});
