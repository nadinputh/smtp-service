import { messages, inboxRules, type getDb } from "@mailpocket/db";
import { and, eq, gte, ilike, inArray, lte, sql, type SQL } from "drizzle-orm";
import { buildRuleWhere } from "./rule-conditions.js";
import { escapeLike } from "./validate.js";

export interface MessageFilterQuery {
  q?: string;
  from?: string;
  to?: string;
  status?: string;
  after?: string;
  before?: string;
  ruleId?: string;
}

/**
 * WHERE conditions shared by the message list and export, so an export
 * always reflects what's on screen. `ruleId` must already be a valid UUID.
 */
export async function buildMessageConditions(
  db: ReturnType<typeof getDb>,
  inboxId: string,
  query: MessageFilterQuery,
): Promise<SQL[]> {
  const { q, from, to, status, after, before, ruleId } = query;
  const conditions: SQL[] = [eq(messages.inboxId, inboxId)];

  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(
      sql`(${messages.subject} ILIKE ${pattern} OR ${messages.from} ILIKE ${pattern} OR ${messages.to}::text ILIKE ${pattern})`,
    );
  }
  if (from) {
    conditions.push(ilike(messages.from, `%${escapeLike(from)}%`));
  }
  if (to) {
    conditions.push(sql`${messages.to}::text ILIKE ${`%${escapeLike(to)}%`}`);
  }
  if (status) {
    // One status, or several as a comma-separated list ("bounced,failed")
    const statuses = status.split(",").filter(Boolean).slice(0, 20);
    if (statuses.length) conditions.push(inArray(messages.status, statuses));
  }
  if (after) {
    const afterDate = new Date(after);
    if (!isNaN(afterDate.getTime())) {
      conditions.push(gte(messages.createdAt, afterDate));
    }
  }
  if (before) {
    const beforeDate = new Date(before);
    if (!isNaN(beforeDate.getTime())) {
      // Include the full selected day by advancing to end-of-day
      beforeDate.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(messages.createdAt, beforeDate));
    }
  }
  if (ruleId) {
    const [rule] = await db
      .select()
      .from(inboxRules)
      .where(and(eq(inboxRules.id, ruleId), eq(inboxRules.inboxId, inboxId)))
      .limit(1);
    if (rule) {
      const ruleWhere = buildRuleWhere(rule.conditions, rule.logic ?? "AND");
      if (ruleWhere) conditions.push(ruleWhere);
    }
  }

  return conditions;
}
