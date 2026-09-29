import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb, suppressions } from "@mailpocket/db";
import { eq, and, desc, ilike, count, sql } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { isOwnerOrAdmin, isGlobalAdmin, isUuid } from "../middleware/access.js";
import { normalizeEmail } from "../lib/address.js";

const MANUAL_REASONS = ["manual", "hard_bounce", "complaint"];

export function registerSuppressionRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // List suppressions (paginated, searchable)
  app.get<{
    Querystring: { q?: string; page?: string; limit?: string };
  }>("/api/suppressions", { preHandler: authGuard }, async (request) => {
    const { q, page: pageStr = "1", limit: limitStr = "50" } = request.query;
    const page = Math.max(1, parseInt(pageStr, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr, 10) || 50));
    const offset = (page - 1) * limit;
    const userId = request.user!.userId;
    const admin = await isGlobalAdmin(userId);

    const conditions = [];
    if (!admin) {
      conditions.push(eq(suppressions.userId, userId));
    }
    if (typeof q === "string" && q) {
      // Escape LIKE wildcards so the search is a literal substring match.
      const literal = q.replace(/[\\%_]/g, "\\$&");
      conditions.push(ilike(suppressions.email, `%${literal}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db
      .select({ count: count() })
      .from(suppressions)
      .where(where);

    const rows = await db
      .select()
      .from(suppressions)
      .where(where)
      .orderBy(desc(suppressions.createdAt))
      .limit(limit)
      .offset(offset);

    return { suppressions: rows, total: totalResult.count, page, limit };
  });

  // Add suppression manually
  app.post<{ Body: { email: string; reason?: string } }>(
    "/api/suppressions",
    { preHandler: authGuard },
    async (request, reply) => {
      const { reason = "manual" } = request.body ?? {};
      const email = normalizeEmail(request.body?.email);

      if (!email) {
        return reply
          .status(400)
          .send({ error: "A valid email address is required" });
      }

      if (!MANUAL_REASONS.includes(reason)) {
        return reply.status(400).send({
          error: `reason must be one of: ${MANUAL_REASONS.join(", ")}`,
        });
      }

      // Upsert — ignore if already exists
      const [created] = await db
        .insert(suppressions)
        .values({
          userId: request.user!.userId,
          email,
          reason,
        })
        .onConflictDoNothing()
        .returning();

      if (!created) {
        return reply.status(409).send({ error: "Email is already suppressed" });
      }

      return reply.status(201).send(created);
    },
  );

  // Remove suppression
  app.delete<{ Params: { id: string } }>(
    "/api/suppressions/:id",
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = request.params;

      if (!isUuid(id)) {
        return reply.status(404).send({ error: "Suppression not found" });
      }

      const [existing] = await db
        .select({ id: suppressions.id, userId: suppressions.userId })
        .from(suppressions)
        .where(eq(suppressions.id, id))
        .limit(1);

      if (!existing) {
        return reply.status(404).send({ error: "Suppression not found" });
      }

      if (!(await isOwnerOrAdmin(request.user!.userId, existing.userId))) {
        return reply.status(404).send({ error: "Suppression not found" });
      }

      await db.delete(suppressions).where(eq(suppressions.id, id));

      return { success: true };
    },
  );
}
