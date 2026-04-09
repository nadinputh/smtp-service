import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { inboxes } from "./inboxes.js";
import { users } from "./users.js";

export const inboxMembers = pgTable(
  "inbox_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inboxId: uuid("inbox_id")
      .notNull()
      .references(() => inboxes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("viewer"), // owner, editor, viewer
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inbox_members_inbox_user_idx").on(table.inboxId, table.userId),
  ],
);
