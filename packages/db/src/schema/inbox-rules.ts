import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";
import { inboxes } from "./inboxes.js";

export type RuleConditionField =
  | "from"
  | "to"
  | "subject"
  | "status"
  | "spam_score"
  | "has_attachment";

export type RuleConditionOp =
  | "contains"
  | "not_contains"
  | "equals"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "lt";

export type RuleCondition = {
  field: RuleConditionField;
  op: RuleConditionOp;
  value: string;
};

export const inboxRules = pgTable("inbox_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  inboxId: uuid("inbox_id")
    .notNull()
    .references(() => inboxes.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).default("indigo"),
  conditions: jsonb("conditions").$type<RuleCondition[]>().notNull(),
  logic: varchar("logic", { length: 3 }).notNull().default("AND"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
