import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import {
  getDb,
  inboxes,
  inboxMembers,
  teams,
  teamMembers,
  userQuotas,
} from "@mailpocket/db";
import { eq, and, count, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { authGuard } from "../middleware/auth.js";
import { requireInboxRole } from "../middleware/access.js";

function generateSmtpCredentials() {
  const username = randomBytes(8).toString("hex");
  const password = randomBytes(16).toString("hex");
  return { username, password };
}

export function registerInboxRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // List inboxes the user has access to (owned, shared, or via team)
  app.get(
    "/api/inboxes",
    { preHandler: authGuard },
    async (request, _reply) => {
      const userId = request.user!.userId;

      // Get inboxes via: 1) ownership, 2) explicit membership, 3) team membership
      const result = await db.execute(sql`
        SELECT DISTINCT i.id, i.name, i.smtp_username AS "smtpUsername", i.created_at AS "createdAt",
          i.team_id AS "teamId",
          t.name AS "teamName",
          COALESCE((SELECT COUNT(*) FROM messages m WHERE m.inbox_id = i.id AND m.is_read = false), 0)::int AS "unreadCount"
        FROM inboxes i
        LEFT JOIN inbox_members im ON im.inbox_id = i.id AND im.user_id = ${userId}
        LEFT JOIN team_members tm ON tm.team_id = i.team_id AND tm.user_id = ${userId}
        LEFT JOIN teams t ON t.id = i.team_id
        WHERE i.user_id = ${userId}
           OR im.user_id IS NOT NULL
           OR tm.user_id IS NOT NULL
        ORDER BY i.created_at DESC
      `);
      return result.rows;
    },
  );

  // Get a single inbox (any role)
  app.get<{ Params: { id: string } }>(
    "/api/inboxes/:id",
    { preHandler: [authGuard, requireInboxRole("viewer")] },
    async (request, reply) => {
      const { id } = request.params;
      const result = await db.execute(sql`
        SELECT i.id, i.name,
          i.smtp_username AS "smtpUsername",
          i.smtp_password AS "smtpPassword",
          i.user_id AS "userId",
          i.team_id AS "teamId",
          i.created_at AS "createdAt",
          i.updated_at AS "updatedAt",
          t.name AS "teamName"
        FROM inboxes i
        LEFT JOIN teams t ON t.id = i.team_id
        WHERE i.id = ${id}
        LIMIT 1
      `);

      if (!result.rows.length) {
        return reply.status(404).send({ error: "Inbox not found" });
      }
      return { ...result.rows[0], currentUserRole: request.inboxRole };
    },
  );

  // Update an inbox (owner only)
  app.put<{
    Params: { id: string };
    Body: { name?: string; teamId?: string | null };
  }>(
    "/api/inboxes/:id",
    { preHandler: [authGuard, requireInboxRole("owner")] },
    async (request, reply) => {
      const { id } = request.params;
      const { name, teamId } = request.body;

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (name?.trim()) {
        updates.name = name.trim();
      }

      if (teamId !== undefined) {
        // Validate team exists if assigning
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
        .where(eq(inboxes.id, id))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: "Inbox not found" });
      }

      return updated;
    },
  );

  // Create a new inbox with auto-generated SMTP credentials
  app.post<{ Body: { name: string; teamId?: string } }>(
    "/api/inboxes",
    { preHandler: authGuard },
    async (request, reply) => {
      const { name, teamId } = request.body;

      if (!name) {
        return reply.status(400).send({ error: "Name is required" });
      }

      // Check inbox quota
      const userId = request.user!.userId;
      let [quota] = await db
        .select()
        .from(userQuotas)
        .where(eq(userQuotas.userId, userId))
        .limit(1);

      if (!quota) {
        [quota] = await db.insert(userQuotas).values({ userId }).returning();
      }

      const [inboxCount] = await db
        .select({ count: count() })
        .from(inboxes)
        .where(eq(inboxes.userId, userId));

      if (inboxCount.count >= quota.maxInboxes) {
        return reply.status(429).send({
          error: `Inbox limit reached (${quota.maxInboxes}). Delete an inbox or upgrade your quota.`,
        });
      }

      const creds = generateSmtpCredentials();

      const [inbox] = await db
        .insert(inboxes)
        .values({
          userId: request.user!.userId,
          teamId: teamId ?? null,
          name,
          smtpUsername: creds.username,
          smtpPassword: creds.password,
        })
        .returning();

      return reply.status(201).send(inbox);
    },
  );

  // Delete an inbox (owner only)
  app.delete<{ Params: { id: string } }>(
    "/api/inboxes/:id",
    { preHandler: [authGuard, requireInboxRole("owner")] },
    async (request, reply) => {
      const { id } = request.params;
      const [deleted] = await db
        .delete(inboxes)
        .where(eq(inboxes.id, id))
        .returning({ id: inboxes.id });

      if (!deleted) {
        return reply.status(404).send({ error: "Inbox not found" });
      }
      return { success: true };
    },
  );
}
