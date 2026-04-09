import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 512 }).notNull(),
    reason: varchar("reason", { length: 50 }).notNull(), // hard_bounce, complaint, manual
    source: varchar("source", { length: 512 }), // e.g. messageId that caused it
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("suppressions_user_email_idx").on(table.userId, table.email),
  ],
);
