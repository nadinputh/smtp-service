import type { FastifyInstance } from "fastify";
import { getEnv } from "@smtp-service/env";
import { getDb, users } from "@smtp-service/db";
import { eq, ilike, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { authGuard } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/access.js";

export function registerAdminRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  const adminPreHandler = [authGuard, requireAdmin];

  // ─── Create user ─────────────────────────────────────────
  app.post<{
    Body: { email: string; password: string; name?: string; role?: string };
  }>(
    "/api/admin/users",
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const { email, password, name, role } = request.body;

      if (!email?.trim() || !password) {
        return reply
          .status(400)
          .send({ error: "Email and password are required" });
      }

      if (password.length < 6) {
        return reply
          .status(400)
          .send({ error: "Password must be at least 6 characters" });
      }

      if (role && role !== "admin" && role !== "user") {
        return reply
          .status(400)
          .send({ error: 'Role must be "admin" or "user"' });
      }

      // Check duplicate
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()))
        .limit(1);

      if (existing) {
        return reply.status(409).send({ error: "Email already in use" });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const [created] = await db
        .insert(users)
        .values({
          email: email.trim().toLowerCase(),
          passwordHash,
          name: name?.trim() || null,
          role: role ?? "user",
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          createdAt: users.createdAt,
        });

      return reply.status(201).send(created);
    },
  );

  // ─── List users (paginated) ──────────────────────────────
  app.get<{
    Querystring: { page?: string; limit?: string; search?: string };
  }>("/api/admin/users", { preHandler: adminPreHandler }, async (request) => {
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(request.query.limit ?? "25", 10) || 25),
    );
    const offset = (page - 1) * limit;

    const conditions = [];
    if (request.query.search?.trim()) {
      const term = `%${request.query.search.trim()}%`;
      conditions.push(ilike(users.email, term));
    }

    const where = conditions.length > 0 ? conditions[0] : undefined;

    const [data, countResult] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(where)
        .orderBy(users.createdAt)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(where),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total: countResult[0].count,
        pages: Math.ceil(countResult[0].count / limit),
      },
    };
  });

  // ─── Get user detail ─────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/admin/users/:id",
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, request.params.id))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return user;
    },
  );

  // ─── Update user (role, name) ────────────────────────────
  app.put<{
    Params: { id: string };
    Body: { role?: string; name?: string };
  }>(
    "/api/admin/users/:id",
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const { role, name } = request.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (role !== undefined) {
        if (role !== "admin" && role !== "user") {
          return reply
            .status(400)
            .send({ error: 'Role must be "admin" or "user"' });
        }

        // Prevent demoting yourself
        if (request.params.id === request.user!.userId && role !== "admin") {
          return reply
            .status(400)
            .send({ error: "Cannot demote your own admin account" });
        }

        updates.role = role;
      }

      if (name !== undefined) {
        updates.name = name.trim() || null;
      }

      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, request.params.id))
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          updatedAt: users.updatedAt,
        });

      if (!updated) {
        return reply.status(404).send({ error: "User not found" });
      }

      return updated;
    },
  );

  // ─── Set user password (admin) ─────────────────────────────
  app.put<{
    Params: { id: string };
    Body: { password: string };
  }>(
    "/api/admin/users/:id/password",
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const { password } = request.body;

      if (!password || password.length < 6) {
        return reply
          .status(400)
          .send({ error: "Password must be at least 6 characters" });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const [updated] = await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, request.params.id))
        .returning({ id: users.id });

      if (!updated) {
        return reply.status(404).send({ error: "User not found" });
      }

      return { success: true };
    },
  );

  // ─── Delete user ─────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/api/admin/users/:id",
    { preHandler: adminPreHandler },
    async (request, reply) => {
      // Prevent deleting yourself
      if (request.params.id === request.user!.userId) {
        return reply
          .status(400)
          .send({ error: "Cannot delete your own account" });
      }

      const [deleted] = await db
        .delete(users)
        .where(eq(users.id, request.params.id))
        .returning({ id: users.id });

      if (!deleted) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.status(204).send();
    },
  );
}
