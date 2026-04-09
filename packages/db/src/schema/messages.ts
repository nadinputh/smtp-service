import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  real,
} from "drizzle-orm/pg-core";
import { inboxes } from "./inboxes.js";

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  inboxId: uuid("inbox_id")
    .notNull()
    .references(() => inboxes.id, { onDelete: "cascade" }),

  // Envelope & headers
  from: varchar("from", { length: 512 }).notNull(),
  to: jsonb("to").$type<string[]>().notNull(),
  cc: jsonb("cc").$type<string[]>(),
  bcc: jsonb("bcc").$type<string[]>(),
  subject: varchar("subject", { length: 1000 }),
  date: timestamp("date", { withTimezone: true }),

  // Body
  html: text("html"),
  text: text("text"),

  // Storage references
  rawKey: varchar("raw_key", { length: 512 }).notNull(), // MinIO key for raw .eml
  attachments: jsonb("attachments").$type<
    {
      filename: string;
      contentType: string;
      size: number;
      storageKey: string;
    }[]
  >(),

  // Metadata
  size: integer("size"), // raw email size in bytes
  status: varchar("status", { length: 50 }).notNull().default("received"),

  // Spam analysis
  spamScore: real("spam_score"),
  spamRules:
    jsonb("spam_rules").$type<
      { rule: string; score: number; description: string }[]
    >(),

  // Scheduling
  sendAt: timestamp("send_at", { withTimezone: true }),

  // Custom headers (X-* headers set via API)
  customHeaders: jsonb("custom_headers").$type<Record<string, string>>(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
