import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { webhooks } from "./webhooks.js";

export const webhookLogs = pgTable("webhook_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  webhookId: uuid("webhook_id")
    .notNull()
    .references(() => webhooks.id, { onDelete: "cascade" }),

  event: varchar("event", { length: 50 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),

  statusCode: integer("status_code"),
  responseBody: text("response_body"),
  error: text("error"),
  attempt: integer("attempt").notNull().default(1),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
