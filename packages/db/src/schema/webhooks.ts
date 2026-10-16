import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { inboxes } from "./inboxes.js";

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  inboxId: uuid("inbox_id")
    .notNull()
    .references(() => inboxes.id, { onDelete: "cascade" }),

  url: varchar("url", { length: 2048 }).notNull(),

  // Signs each delivery (X-MailPocket-Signature) so receivers can authenticate it
  secret: varchar("secret", { length: 64 })
    .notNull()
    .default(sql`replace(gen_random_uuid()::text, '-', '')`),

  // Which events to fire on
  onDelivered: boolean("on_delivered").notNull().default(true),
  onBounced: boolean("on_bounced").notNull().default(true),
  onOpened: boolean("on_opened").notNull().default(false),
  onReceived: boolean("on_received").notNull().default(true),

  active: boolean("active").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
