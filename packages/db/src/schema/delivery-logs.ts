import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";
import { messages } from "./messages.js";

export const deliveryLogs = pgTable("delivery_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),

  recipient: varchar("recipient", { length: 512 }).notNull(),

  // queued → sending → delivered | deferred | bounced | failed
  status: varchar("status", { length: 50 }).notNull().default("queued"),

  // SMTP response info
  smtpCode: integer("smtp_code"),
  smtpResponse: text("smtp_response"),

  // MX host used for delivery
  mxHost: varchar("mx_host", { length: 255 }),

  attempts: integer("attempts").notNull().default(0),

  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
