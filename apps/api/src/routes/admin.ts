import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import {
  getDb,
  users,
  inboxes,
  messages,
  teams,
  deliveryLogs,
} from "@mailpocket/db";
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

  // ═══════════════════════════════════════════════════════════
  // ─── Admin Inbox Management ───────────────────────────────
  // ═══════════════════════════════════════════════════════════

  // ─── List all inboxes (paginated) ────────────────────────
  app.get<{
    Querystring: { page?: string; limit?: string; search?: string };
  }>("/api/admin/inboxes", { preHandler: adminPreHandler }, async (request) => {
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(request.query.limit ?? "25", 10) || 25),
    );
    const offset = (page - 1) * limit;
    const search = request.query.search?.trim();

    const searchFilter = search
      ? sql`AND (i.name ILIKE ${"%" + search + "%"} OR u.email ILIKE ${"%" + search + "%"} OR i.smtp_username ILIKE ${"%" + search + "%"})`
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
      const { name, userId, teamId } = request.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };

      if (name?.trim()) {
        updates.name = name.trim();
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
    async (request) => {
      const period = request.query.period ?? "30d";
      const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [systemResult, periodResult, entityCounts] = await Promise.all([
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status IN ('queued','sending','delivered','bounced','failed'))::int AS sent,
            COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
            COUNT(*) FILTER (WHERE status = 'bounced' OR status = 'failed')::int AS bounced,
            COUNT(*) FILTER (WHERE status = 'received')::int AS received
          FROM messages
        `),
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status IN ('queued','sending','delivered','bounced','failed'))::int AS sent,
            COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
            COUNT(*) FILTER (WHERE status = 'bounced' OR status = 'failed')::int AS bounced,
            COUNT(*) FILTER (WHERE status = 'received')::int AS received
          FROM messages
          WHERE created_at >= ${since}
        `),
        db.execute(sql`
          SELECT
            (SELECT COUNT(*)::int FROM users) AS "totalUsers",
            (SELECT COUNT(*)::int FROM inboxes) AS "totalInboxes",
            (SELECT COUNT(*)::int FROM teams) AS "totalTeams"
        `),
      ]);

      const sys = systemResult.rows[0] as Record<string, number>;
      const per = periodResult.rows[0] as Record<string, number>;
      const ent = entityCounts.rows[0] as Record<string, number>;

      return {
        totalUsers: ent.totalUsers,
        totalInboxes: ent.totalInboxes,
        totalTeams: ent.totalTeams,
        totalMessages: sys.total,
        totalSent: sys.sent,
        totalDelivered: sys.delivered,
        totalBounced: sys.bounced,
        totalReceived: sys.received,
        deliveryRate:
          sys.sent > 0 ? Math.round((sys.delivered / sys.sent) * 100) : 0,
        bounceRate:
          sys.sent > 0 ? Math.round((sys.bounced / sys.sent) * 100) : 0,
        period: {
          days,
          total: per.total,
          sent: per.sent,
          delivered: per.delivered,
          bounced: per.bounced,
          received: per.received,
        },
      };
    },
  );

  // ─── System-wide time series ─────────────────────────────
  app.get<{ Querystring: { metric?: string; period?: string } }>(
    "/api/admin/analytics/timeseries",
    { preHandler: adminPreHandler },
    async (request) => {
      const metric = request.query.metric ?? "sent";
      const period = request.query.period ?? "30d";
      const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      let statusFilter: string;
      switch (metric) {
        case "delivered":
          statusFilter = `AND status = 'delivered'`;
          break;
        case "bounced":
          statusFilter = `AND (status = 'bounced' OR status = 'failed')`;
          break;
        case "received":
          statusFilter = `AND status = 'received'`;
          break;
        case "sent":
        default:
          statusFilter = `AND status IN ('queued','sending','delivered','bounced','failed')`;
          break;
      }

      const tsResult = await db.execute(sql`
        SELECT
          TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
          COUNT(*)::int AS count
        FROM messages
        WHERE created_at >= ${since}
          ${sql.raw(statusFilter)}
        GROUP BY created_at::date
        ORDER BY created_at::date ASC
      `);
      const tsRows = tsResult.rows as { day: string; count: number }[];

      const dataMap = new Map<string, number>();
      for (const row of tsRows) dataMap.set(row.day, row.count);

      const labels: string[] = [];
      const values: number[] = [];
      for (let d = 0; d < days; d++) {
        const date = new Date(since.getTime() + d * 24 * 60 * 60 * 1000);
        const key = date.toISOString().slice(0, 10);
        labels.push(key);
        values.push(dataMap.get(key) ?? 0);
      }

      return { labels, values, metric, period };
    },
  );

  // ─── Top users by message count ──────────────────────────
  app.get<{ Querystring: { limit?: string } }>(
    "/api/admin/analytics/top-users",
    { preHandler: adminPreHandler },
    async (request) => {
      const limit = Math.min(
        50,
        Math.max(1, parseInt(request.query.limit ?? "10", 10) || 10),
      );

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
      const limit = Math.min(
        50,
        Math.max(1, parseInt(request.query.limit ?? "10", 10) || 10),
      );

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
