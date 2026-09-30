import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb, inboxes, userQuotas } from "@mailpocket/db";
import { eq, count, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { authGuard } from "../middleware/auth.js";
import {
  requireInboxRole,
  requireUuidParams,
  canViewTeam,
  isUuid,
} from "../middleware/access.js";
import { cleanString } from "../lib/validate.js";

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
          COALESCE((SELECT COUNT(*) FROM messages m WHERE m.inbox_id = i.id AND m.is_read = false), 0)::int AS "unreadCount",
          COALESCE((SELECT COUNT(*) FROM messages m WHERE m.inbox_id = i.id AND m.status IN ('bounced','failed')), 0)::int AS "failedCount",
          CASE
            WHEN i.user_id = ${userId} THEN 'owner'
            WHEN im.user_id IS NOT NULL THEN im.role::text
            WHEN tm.user_id IS NOT NULL AND tm.role = 'admin' THEN 'editor'
            WHEN tm.user_id IS NOT NULL THEN 'viewer'
            ELSE 'viewer'
          END AS "currentUserRole"
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
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("viewer")] },
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
      // SMTP credentials let the holder deliver into the inbox, so read-only
      // viewers and API keys (a read scope must not hand out write access)
      // don't get the password.
      const { smtpPassword, ...detail } = result.rows[0] as Record<
        string,
        unknown
      >;
      return {
        ...detail,
        ...(request.inboxRole !== "viewer" && !request.apiKeyScopes
          ? { smtpPassword }
          : {}),
        currentUserRole: request.inboxRole,
      };
    },
  );

  // Update an inbox (owner only)
  app.put<{
    Params: { id: string };
    Body: { name?: string; teamId?: string | null };
  }>(
    "/api/inboxes/:id",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("owner")] },
    async (request, reply) => {
      const { id } = request.params;
      const { name, teamId } = request.body ?? {};

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {
        const clean = cleanString(name, 255);
        if (!clean) {
          return reply
            .status(400)
            .send({ error: "name must be a non-empty string (max 255)" });
        }
        updates.name = clean;
      }

      if (teamId !== undefined) {
        if (teamId !== null) {
          if (!isUuid(teamId)) {
            return reply.status(400).send({ error: "teamId must be a UUID" });
          }
          // Only teams the user belongs to (404 also hides other teams)
          if (!(await canViewTeam(request.user!.userId, teamId))) {
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
  app.post<{ Body: { name: string; teamId?: string | null } }>(
    "/api/inboxes",
    { preHandler: authGuard },
    async (request, reply) => {
      const body = request.body ?? ({} as { name?: unknown; teamId?: unknown });
      const name = cleanString(body.name, 255);
      const teamId = body.teamId ?? null;

      if (!name) {
        return reply
          .status(400)
          .send({ error: "Name is required (max 255 characters)" });
      }

      const userId = request.user!.userId;

      if (teamId !== null) {
        if (!isUuid(teamId)) {
          return reply.status(400).send({ error: "teamId must be a UUID" });
        }
        // Only teams the user belongs to (404 also hides other teams)
        if (!(await canViewTeam(userId, teamId))) {
          return reply.status(404).send({ error: "Team not found" });
        }
      }

      // Count + insert under a per-user lock so concurrent creates can't
      // both pass the quota check.
      const creds = generateSmtpCredentials();
      const result = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`,
        );

        await tx.insert(userQuotas).values({ userId }).onConflictDoNothing();
        const [quota] = await tx
          .select()
          .from(userQuotas)
          .where(eq(userQuotas.userId, userId))
          .limit(1);

        const [inboxCount] = await tx
          .select({ count: count() })
          .from(inboxes)
          .where(eq(inboxes.userId, userId));

        if (inboxCount.count >= quota.maxInboxes) {
          return { limit: quota.maxInboxes };
        }

        const [created] = await tx
          .insert(inboxes)
          .values({
            userId,
            teamId,
            name,
            smtpUsername: creds.username,
            smtpPassword: creds.password,
          })
          .returning();
        return { inbox: created };
      });

      if ("limit" in result) {
        return reply.status(429).send({
          error: `Inbox limit reached (${result.limit}). Delete an inbox or upgrade your quota.`,
        });
      }
      const inbox = result.inbox;

      return reply.status(201).send(inbox);
    },
  );

  // Delete an inbox (owner only)
  app.delete<{ Params: { id: string } }>(
    "/api/inboxes/:id",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("owner")] },
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
