import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import {
  getDb,
  users,
  inboxes,
  messages,
  teams,
  deliveryLogs,
  apiKeys,
} from "@mailpocket/db";
import { eq, ilike, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { authGuard } from "../middleware/auth.js";
import {
  requireAdmin,
  requireUuidParams,
  isUuid,
} from "../middleware/access.js";
import { normalizeEmail } from "../lib/address.js";
import { escapeLike, clampInt, cleanString } from "../lib/validate.js";
import {
  badPeriod,
  isMetric,
  overviewStats,
  parsePeriod,
  timeseries,
} from "../lib/analytics.js";
import { passwordPolicyError } from "../lib/password-policy.js";

export function registerAdminRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  const adminPreHandler = [authGuard, requireAdmin, requireUuidParams];

  // ─── Create user ─────────────────────────────────────────
  app.post<{
    Body: { email: string; password: string; name?: string; role?: string };
  }>(
    "/api/admin/users",
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const { password, name, role } = request.body ?? {};
      const email = normalizeEmail(request.body?.email);

      if (!email || email.length > 255 || password === undefined) {
        return reply
          .status(400)
          .send({ error: "A valid email and a password are required" });
      }
      if (
        name !== undefined &&
        name !== null &&
        (typeof name !== "string" || name.trim().length > 255)
      ) {
        return reply
          .status(400)
          .send({ error: "name must be a string of at most 255 characters" });
      }

      const createPasswordError = passwordPolicyError(password);
      if (createPasswordError) {
        return reply.status(400).send({ error: createPasswordError });
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
        .where(eq(users.email, email))
        .limit(1);

      if (existing) {
        return reply.status(409).send({ error: "Email already in use" });
      }

      const passwordHash = await bcrypt.hash(password as string, 12);

      const [created] = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          name: typeof name === "string" ? name.trim() || null : null,
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
    const page = clampInt(request.query.page, 1, 1_000_000);
    const limit = clampInt(request.query.limit, 25, 100);
    const offset = (page - 1) * limit;

    const search =
      typeof request.query.search === "string"
        ? request.query.search.trim()
        : "";
    const where = search
      ? ilike(users.email, `%${escapeLike(search)}%`)
      : undefined;

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
      const { role, name } = request.body ?? {};
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
        if (name !== null && typeof name !== "string") {
          return reply.status(400).send({ error: "name must be a string" });
        }
        if (typeof name === "string" && name.trim().length > 255) {
          return reply
            .status(400)
            .send({ error: "name must be at most 255 characters" });
        }
        updates.name = name?.trim() || null;
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
      const password = request.body?.password;

      if (!password) {
        return reply.status(400).send({ error: "Password is required" });
      }
      const setPasswordError = passwordPolicyError(password);
      if (setPasswordError) {
        return reply.status(400).send({ error: setPasswordError });
      }

      const passwordHash = await bcrypt.hash(password as string, 12);

      const [updated] = await db
        .update(users)
        .set({
          passwordHash,
          passwordChangedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, request.params.id))
        .returning({ id: users.id });

      if (!updated) {
        return reply.status(404).send({ error: "User not found" });
      }
      await db.delete(apiKeys).where(eq(apiKeys.userId, updated.id));

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

  // ═══════════════════════════════════════════════════════════
  // ─── Admin Inbox Management ───────────────────────────────
  // ═══════════════════════════════════════════════════════════

  // ─── List all inboxes (paginated) ────────────────────────
  app.get<{
    Querystring: { page?: string; limit?: string; search?: string };
  }>("/api/admin/inboxes", { preHandler: adminPreHandler }, async (request) => {
    const page = clampInt(request.query.page, 1, 1_000_000);
    const limit = clampInt(request.query.limit, 25, 100);
    const offset = (page - 1) * limit;
    const search =
      typeof request.query.search === "string"
        ? request.query.search.trim()
        : "";

    const term = `%${escapeLike(search)}%`;
    const searchFilter = search
      ? sql`AND (i.name ILIKE ${term} OR u.email ILIKE ${term} OR i.smtp_username ILIKE ${term})`
      : sql``;

    const [dataResult, countResult] = await Promise.all([
      db.execute(sql`
          SELECT
            i.id, i.name, i.smtp_username AS "smtpUsername",
            i.user_id AS "userId", i.team_id AS "teamId",
            i.created_at AS "createdAt",
            u.email AS "ownerEmail", u.name AS "ownerName",
            t.name AS "teamName",
            COALESCE((SELECT COUNT(*) FROM messages m WHERE m.inbox_id = i.id), 0)::int AS "messageCount"
          FROM inboxes i
          JOIN users u ON u.id = i.user_id
          LEFT JOIN teams t ON t.id = i.team_id
          WHERE 1=1 ${searchFilter}
          ORDER BY i.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `),
      db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM inboxes i
          JOIN users u ON u.id = i.user_id
          WHERE 1=1 ${searchFilter}
        `),
    ]);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total: (countResult.rows[0] as { count: number }).count,
        pages: Math.ceil(
          (countResult.rows[0] as { count: number }).count / limit,
        ),
      },
    };
  });

  // ─── Get inbox detail ────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/admin/inboxes/:id",
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const result = await db.execute(sql`
        SELECT
          i.id, i.name, i.smtp_username AS "smtpUsername",
          i.smtp_password AS "smtpPassword",
          i.user_id AS "userId", i.team_id AS "teamId",
          i.created_at AS "createdAt", i.updated_at AS "updatedAt",
          u.email AS "ownerEmail", u.name AS "ownerName",
          t.name AS "teamName",
          COALESCE((SELECT COUNT(*) FROM messages m WHERE m.inbox_id = i.id), 0)::int AS "messageCount"
        FROM inboxes i
        JOIN users u ON u.id = i.user_id
        LEFT JOIN teams t ON t.id = i.team_id
        WHERE i.id = ${request.params.id}
        LIMIT 1
      `);

      if (!result.rows.length) {
        return reply.status(404).send({ error: "Inbox not found" });
      }

      return result.rows[0];
    },
  );

  // ─── Update inbox (name, owner, team) ────────────────────
  app.put<{
    Params: { id: string };
    Body: { name?: string; userId?: string; teamId?: string | null };
  }>(
    "/api/admin/inboxes/:id",
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const { name, userId, teamId } = request.body ?? {};
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (name !== undefined) {
        const clean = cleanString(name, 255);
        if (!clean) {
          return reply
            .status(400)
            .send({ error: "name must be a non-empty string (max 255)" });
        }
        updates.name = clean;
      }

      if (
        (userId !== undefined && !isUuid(userId)) ||
        (teamId !== undefined && teamId !== null && !isUuid(teamId))
      ) {
        return reply
          .status(400)
          .send({ error: "userId and teamId must be UUIDs" });
      }

      if (userId) {
        const [user] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }
        updates.userId = userId;
      }

      if (teamId !== undefined) {
        if (teamId !== null) {
          const [team] = await db
            .select({ id: teams.id })
            .from(teams)
            .where(eq(teams.id, teamId))
            .limit(1);
          if (!team) {
            return reply.status(404).send({ error: "Team not found" });
          }
        }
        updates.teamId = teamId;
      }

      const [updated] = await db
        .update(inboxes)
        .set(updates)
        .where(eq(inboxes.id, request.params.id))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: "Inbox not found" });
      }

      return updated;
    },
  );

  // ─── Delete inbox ────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/api/admin/inboxes/:id",
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const [deleted] = await db
        .delete(inboxes)
        .where(eq(inboxes.id, request.params.id))
        .returning({ id: inboxes.id });

      if (!deleted) {
        return reply.status(404).send({ error: "Inbox not found" });
      }

      return reply.status(204).send();
    },
  );

  // ═══════════════════════════════════════════════════════════
  // ─── Admin Analytics Dashboard ────────────────────────────
  // ═══════════════════════════════════════════════════════════

  // ─── System-wide overview ────────────────────────────────
  app.get<{ Querystring: { period?: string } }>(
    "/api/admin/analytics/overview",
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const period = parsePeriod(request.query.period);
      if (!period) return badPeriod(reply);

      const [stats, entityCounts] = await Promise.all([
        overviewStats(db, sql`TRUE`, period),
        db.execute(sql`
          SELECT
            (SELECT COUNT(*)::int FROM users) AS "totalUsers",
            (SELECT COUNT(*)::int FROM inboxes) AS "totalInboxes",
            (SELECT COUNT(*)::int FROM teams) AS "totalTeams"
        `),
      ]);
      const ent = entityCounts.rows[0] as Record<string, number>;

      return {
        totalUsers: ent.totalUsers,
        totalInboxes: ent.totalInboxes,
        totalTeams: ent.totalTeams,
        ...stats,
      };
    },
  );

  // ─── System-wide time series ─────────────────────────────
  app.get<{ Querystring: { metric?: string; period?: string } }>(
    "/api/admin/analytics/timeseries",
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const period = parsePeriod(request.query.period);
      if (!period) return badPeriod(reply);

      const metric = request.query.metric ?? "sent";
      if (!isMetric(metric)) {
        return reply.status(400).send({
          error: "metric must be sent, delivered, bounced or received",
        });
      }

      return timeseries(db, sql`TRUE`, metric, period);
    },
  );

  // ─── Top users by message count ──────────────────────────
  app.get<{ Querystring: { limit?: string } }>(
    "/api/admin/analytics/top-users",
    { preHandler: adminPreHandler },
    async (request) => {
      const limit = clampInt(request.query.limit, 10, 50);

      const result = await db.execute(sql`
        SELECT
          u.id, u.email, u.name,
          COUNT(DISTINCT i.id)::int AS "inboxCount",
          COALESCE(SUM(msg.cnt), 0)::int AS "messageCount"
        FROM users u
        LEFT JOIN inboxes i ON i.user_id = u.id
        LEFT JOIN (
          SELECT inbox_id, COUNT(*)::int AS cnt FROM messages GROUP BY inbox_id
        ) msg ON msg.inbox_id = i.id
        GROUP BY u.id, u.email, u.name
        ORDER BY "messageCount" DESC
        LIMIT ${limit}
      `);

      return { users: result.rows };
    },
  );

  // ─── Top inboxes by message count ────────────────────────
  app.get<{ Querystring: { limit?: string } }>(
    "/api/admin/analytics/top-inboxes",
    { preHandler: adminPreHandler },
    async (request) => {
      const limit = clampInt(request.query.limit, 10, 50);

      const result = await db.execute(sql`
        SELECT
          i.id, i.name, i.smtp_username AS "smtpUsername",
          u.email AS "ownerEmail", u.name AS "ownerName",
          t.name AS "teamName",
          COALESCE((SELECT COUNT(*) FROM messages m WHERE m.inbox_id = i.id), 0)::int AS "messageCount"
        FROM inboxes i
        JOIN users u ON u.id = i.user_id
        LEFT JOIN teams t ON t.id = i.team_id
        ORDER BY "messageCount" DESC
        LIMIT ${limit}
      `);

      return { inboxes: result.rows };
    },
  );
}
