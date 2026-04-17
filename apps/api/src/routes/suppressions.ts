import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb, suppressions } from "@mailpocket/db";
import { eq, and, desc, ilike, count, sql } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { isOwnerOrAdmin, isGlobalAdmin } from "../middleware/access.js";

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
    if (q) {
      conditions.push(ilike(suppressions.email, `%${q}%`));
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
      const { email, reason = "manual" } = request.body;

      if (!email) {
        return reply.status(400).send({ error: "email is required" });
      }

      // Upsert — ignore if already exists
      const [created] = await db
        .insert(suppressions)
        .values({
          userId: request.user!.userId,
          email: email.toLowerCase().trim(),
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
