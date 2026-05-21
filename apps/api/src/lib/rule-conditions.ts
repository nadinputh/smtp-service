import { messages } from "@mailpocket/db";
import type { RuleCondition } from "@mailpocket/db";
import { eq, ilike, gt, lt, and, or, sql, type SQL } from "drizzle-orm";

export function buildConditionClause(
  condition: RuleCondition,
): SQL | undefined {
  const val = condition.value;

  switch (condition.field) {
    case "from":
      if (condition.op === "contains") return ilike(messages.from, `%${val}%`);
      if (condition.op === "not_contains")
        return sql`${messages.from} NOT ILIKE ${"%" + val + "%"}`;
      if (condition.op === "equals") return eq(messages.from, val);
      if (condition.op === "starts_with")
        return ilike(messages.from, `${val}%`);
      if (condition.op === "ends_with") return ilike(messages.from, `%${val}`);
      break;

    case "to":
      if (condition.op === "contains")
        return sql`${messages.to}::text ILIKE ${"%" + val + "%"}`;
      if (condition.op === "not_contains")
        return sql`${messages.to}::text NOT ILIKE ${"%" + val + "%"}`;
      break;

    case "subject":
      if (condition.op === "contains")
        return ilike(messages.subject, `%${val}%`);
      if (condition.op === "not_contains")
        return sql`${messages.subject} NOT ILIKE ${"%" + val + "%"}`;
      if (condition.op === "equals") return eq(messages.subject, val);
      if (condition.op === "starts_with")
        return ilike(messages.subject, `${val}%`);
      if (condition.op === "ends_with")
        return ilike(messages.subject, `%${val}`);
      break;

    case "status":
      if (condition.op === "equals") return eq(messages.status, val);
      break;

    case "spam_score": {
      const numVal = parseFloat(val);
      if (isNaN(numVal)) return undefined;
      if (condition.op === "gt") return gt(messages.spamScore, numVal);
      if (condition.op === "lt") return lt(messages.spamScore, numVal);
      break;
    }

    case "has_attachment":
      if (condition.op === "equals" && val === "true")
        return sql`jsonb_array_length(COALESCE(${messages.attachments}, '[]'::jsonb)) > 0`;
      if (condition.op === "equals" && val === "false")
        return sql`jsonb_array_length(COALESCE(${messages.attachments}, '[]'::jsonb)) = 0`;
      break;
  }

  return undefined;
}

export function buildRuleWhere(
  conditions: RuleCondition[],
  logic: string,
): SQL | undefined {
  const clauses = conditions
    .map(buildConditionClause)
    .filter((c): c is SQL => c !== undefined);

  if (!clauses.length) return undefined;
  if (clauses.length === 1) return clauses[0];

  return logic === "OR" ? or(...clauses) : and(...clauses);
}
