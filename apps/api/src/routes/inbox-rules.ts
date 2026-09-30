import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb, messages, inboxRules } from "@mailpocket/db";
import type { RuleCondition } from "@mailpocket/db";
import { eq, and, asc, count, sql } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { requireInboxRole, requireUuidParams } from "../middleware/access.js";
import { cleanString } from "../lib/validate.js";
import { buildRuleWhere } from "../lib/rule-conditions.js";

const VALID_FIELDS = new Set([
  "from",
  "to",
  "subject",
  "status",
  "spam_score",
  "has_attachment",
]);
// Matches the palette the rule UI can render.
const RULE_COLORS = new Set([
  "indigo",
  "blue",
  "green",
  "yellow",
  "orange",
  "red",
  "purple",
  "pink",
]);
const VALID_OPS = new Set([
  "contains",
  "not_contains",
  "equals",
  "starts_with",
  "ends_with",
  "gt",
  "lt",
]);

function validateConditions(
  conditions: unknown[],
): conditions is RuleCondition[] {
  return conditions.every(
    (c: any) =>
      c &&
      typeof c.field === "string" &&
      typeof c.op === "string" &&
      typeof c.value === "string" &&
      VALID_FIELDS.has(c.field) &&
      VALID_OPS.has(c.op),
  );
}

export function registerInboxRuleRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // List rules with message counts
  app.get<{ Params: { id: string } }>(
    "/api/inboxes/:id/rules",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("viewer")] },
    async (request, _reply) => {
      const { id } = request.params;

      const ruleRows = await db
        .select()
        .from(inboxRules)
        .where(eq(inboxRules.inboxId, id))
        .orderBy(asc(inboxRules.order), asc(inboxRules.createdAt));

      const rulesWithCounts = await Promise.all(
        ruleRows.map(async (rule) => {
          const ruleWhere = buildRuleWhere(
            rule.conditions,
            rule.logic ?? "AND",
          );
          const baseWhere = ruleWhere
            ? and(eq(messages.inboxId, id), ruleWhere)
            : eq(messages.inboxId, id);

          const [counts] = await db
            .select({
              total: count(),
              unreadTotal: sql<number>`COUNT(*) FILTER (WHERE ${messages.isRead} = false)`,
            })
            .from(messages)
            .where(baseWhere);

          return {
            ...rule,
            total: counts.total,
            unreadTotal: Number(counts.unreadTotal),
          };
        }),
      );

      return rulesWithCounts;
    },
  );

  // Create a rule
  app.post<{
    Params: { id: string };
    Body: {
      name: string;
      color?: string;
      conditions: unknown[];
      logic?: string;
    };
  }>(
    "/api/inboxes/:id/rules",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("editor")] },
    async (request, reply) => {
      const { id } = request.params;
      const {
        color = "indigo",
        conditions,
        logic = "AND",
      } = request.body ?? {};
      const name = cleanString(request.body?.name, 255);

      if (!name) {
        return reply
          .status(400)
          .send({ error: "name is required (max 255 characters)" });
      }
      if (!RULE_COLORS.has(color)) {
        return reply.status(400).send({ error: "invalid color" });
      }
      if (!Array.isArray(conditions) || !conditions.length) {
        return reply
          .status(400)
          .send({ error: "at least one condition is required" });
      }
      if (!validateConditions(conditions)) {
        return reply
          .status(400)
          .send({ error: "invalid condition field or operator" });
      }

      const [rule] = await db
        .insert(inboxRules)
        .values({
          inboxId: id,
          name,
          color,
          conditions,
          logic: logic === "OR" ? "OR" : "AND",
        })
        .returning();

      return rule;
    },
  );

  // Update a rule
  app.put<{
    Params: { id: string; ruleId: string };
    Body: {
      name?: string;
      color?: string;
      conditions?: unknown[];
      logic?: string;
      order?: number;
    };
  }>(
    "/api/inboxes/:id/rules/:ruleId",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("editor")] },
    async (request, reply) => {
      const { id, ruleId } = request.params;
      const { color, conditions, logic, order } = request.body ?? {};
      const name =
        request.body?.name === undefined
          ? undefined
          : cleanString(request.body.name, 255);

      if (
        name === null ||
        (color !== undefined && !RULE_COLORS.has(color)) ||
        (order !== undefined && !Number.isInteger(order))
      ) {
        return reply
          .status(400)
          .send({ error: "invalid name, color, or order" });
      }

      if (
        conditions !== undefined &&
        (!Array.isArray(conditions) ||
          !conditions.length ||
          !validateConditions(conditions))
      ) {
        return reply.status(400).send({ error: "invalid conditions" });
      }

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (color !== undefined) updates.color = color;
      if (conditions !== undefined) updates.conditions = conditions;
      if (logic !== undefined) updates.logic = logic === "OR" ? "OR" : "AND";
      if (order !== undefined) updates.order = order;

      const [updated] = await db
        .update(inboxRules)
        .set(updates)
        .where(and(eq(inboxRules.id, ruleId), eq(inboxRules.inboxId, id)))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: "Rule not found" });
      }

      return updated;
    },
  );

  // Delete a rule
  app.delete<{ Params: { id: string; ruleId: string } }>(
    "/api/inboxes/:id/rules/:ruleId",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("editor")] },
    async (request, reply) => {
      const { id, ruleId } = request.params;

      const [deleted] = await db
        .delete(inboxRules)
        .where(and(eq(inboxRules.id, ruleId), eq(inboxRules.inboxId, id)))
        .returning({ id: inboxRules.id });

      if (!deleted) {
        return reply.status(404).send({ error: "Rule not found" });
      }

      return { success: true };
    },
  );
}
