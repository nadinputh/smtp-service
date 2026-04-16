import type { FastifyInstance } from "fastify";
import { getEnv } from "@smtp-service/env";
import { getDb, teams, teamMembers, users } from "@smtp-service/db";
import { eq, and, inArray, or, ilike } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { isGlobalAdmin } from "../middleware/access.js";

export function registerTeamRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // ─── List teams ──────────────────────────────────────────
  // Admins see all teams; regular users see only teams they belong to.
  app.get("/api/teams", { preHandler: [authGuard] }, async (request) => {
    const userId = request.user!.userId;
    const admin = await isGlobalAdmin(userId);

    if (admin) {
      return db.select().from(teams);
    }

    // Teams the user owns or is a member of
    const memberRows = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));

    const memberTeamIds = memberRows.map((r) => r.teamId);

    if (memberTeamIds.length === 0) {
      return db.select().from(teams).where(eq(teams.ownerId, userId));
    }

    return db
      .select()
      .from(teams)
      .where(or(eq(teams.ownerId, userId), inArray(teams.id, memberTeamIds)));
  });

  // ─── Create team ─────────────────────────────────────────
  app.post<{ Body: { name: string } }>(
    "/api/teams",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const { name } = request.body;
      if (!name?.trim()) {
        return reply.status(400).send({ error: "Team name is required" });
      }

      const [team] = await db
        .insert(teams)
        .values({ name: name.trim(), ownerId: request.user!.userId })
        .returning();

      // Auto-add creator as team admin
      await db.insert(teamMembers).values({
        teamId: team.id,
        userId: request.user!.userId,
        role: "admin",
      });

      return reply.status(201).send(team);
    },
  );

  // ─── Get team detail ─────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/teams/:id",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const teamId = request.params.id;

      const [team] = await db
        .select()
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);

      if (!team) {
        return reply.status(404).send({ error: "Team not found" });
      }

      const canAccess = await canManageTeam(userId, teamId);
      if (!canAccess && team.ownerId !== userId) {
        // Check basic membership
        const [member] = await db
          .select()
          .from(teamMembers)
          .where(
            and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
          )
          .limit(1);

        if (!member) {
          return reply.status(404).send({ error: "Team not found" });
        }
      }

      return team;
    },
  );

  // ─── Update team ─────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: { name?: string } }>(
    "/api/teams/:id",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const teamId = request.params.id;

      if (!(await canManageTeam(userId, teamId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };
      if (request.body.name?.trim()) {
        updates.name = request.body.name.trim();
      }

      const [updated] = await db
        .update(teams)
        .set(updates)
        .where(eq(teams.id, teamId))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: "Team not found" });
      }

      return updated;
    },
  );

  // ─── Delete team ─────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/api/teams/:id",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const teamId = request.params.id;

      if (!(await canManageTeam(userId, teamId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

      const [deleted] = await db
        .delete(teams)
        .where(eq(teams.id, teamId))
        .returning({ id: teams.id });

      if (!deleted) {
        return reply.status(404).send({ error: "Team not found" });
      }

      return reply.status(204).send();
    },
  );

  // ─── List team members ───────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/teams/:id/members",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const teamId = request.params.id;

      // Must be team member, owner, or global admin
      const admin = await isGlobalAdmin(userId);
      if (!admin) {
        const [team] = await db
          .select({ ownerId: teams.ownerId })
          .from(teams)
          .where(eq(teams.id, teamId))
          .limit(1);

        if (!team) {
          return reply.status(404).send({ error: "Team not found" });
        }

        if (team.ownerId !== userId) {
          const [member] = await db
            .select()
            .from(teamMembers)
            .where(
              and(
                eq(teamMembers.teamId, teamId),
                eq(teamMembers.userId, userId),
              ),
            )
            .limit(1);

          if (!member) {
            return reply.status(404).send({ error: "Team not found" });
          }
        }
      }

      return db
        .select({
          id: teamMembers.id,
          userId: teamMembers.userId,
          role: teamMembers.role,
          email: users.email,
          name: users.name,
          createdAt: teamMembers.createdAt,
        })
        .from(teamMembers)
        .innerJoin(users, eq(teamMembers.userId, users.id))
        .where(eq(teamMembers.teamId, teamId));
    },
  );

  // ─── Add team member ─────────────────────────────────────
  app.post<{
    Params: { id: string };
    Body: { userId: string; role?: string };
  }>(
    "/api/teams/:id/members",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const actorId = request.user!.userId;
      const teamId = request.params.id;
      const { userId: targetUserId, role } = request.body;

      if (!targetUserId) {
        return reply.status(400).send({ error: "userId is required" });
      }

      if (!(await canManageTeam(actorId, teamId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

      const memberRole = role === "admin" ? "admin" : "member";

      try {
        const [member] = await db
          .insert(teamMembers)
          .values({ teamId, userId: targetUserId, role: memberRole })
          .returning();

        return reply.status(201).send(member);
      } catch (err: any) {
        if (err.code === "23505") {
          return reply
            .status(409)
            .send({ error: "User is already a team member" });
        }
        if (err.code === "23503") {
          return reply.status(404).send({ error: "User not found" });
        }
        throw err;
      }
    },
  );

  // ─── Update team member role ─────────────────────────────
  app.put<{
    Params: { id: string; userId: string };
    Body: { role: string };
  }>(
    "/api/teams/:id/members/:userId",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const actorId = request.user!.userId;
      const teamId = request.params.id;
      const targetUserId = request.params.userId;
      const { role } = request.body;

      if (!(await canManageTeam(actorId, teamId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

      const memberRole = role === "admin" ? "admin" : "member";

      const [updated] = await db
        .update(teamMembers)
        .set({ role: memberRole })
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.userId, targetUserId),
          ),
        )
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: "Team member not found" });
      }

      return updated;
    },
  );

  // ─── Remove team member ──────────────────────────────────
  app.delete<{ Params: { id: string; userId: string } }>(
    "/api/teams/:id/members/:userId",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const actorId = request.user!.userId;
      const teamId = request.params.id;
      const targetUserId = request.params.userId;

      if (!(await canManageTeam(actorId, teamId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

      const [deleted] = await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.userId, targetUserId),
          ),
        )
        .returning({ id: teamMembers.id });

      if (!deleted) {
        return reply.status(404).send({ error: "Team member not found" });
      }

      return reply.status(204).send();
    },
  );

  // ─── Search users (for team member picker) ───────────────
  app.get<{ Querystring: { q?: string } }>(
    "/api/users/search",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const query = request.query.q?.trim();
      if (!query || query.length < 2) {
        return reply
          .status(400)
          .send({ error: "Search query must be at least 2 characters" });
      }

      const term = `%${query}%`;
      const results = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(or(ilike(users.email, term), ilike(users.name, term)))
        .limit(10);

      return results;
    },
  );

  // ─── Helper: can the actor manage this team? ─────────────
  // Global admin, team owner, or team-level admin
  async function canManageTeam(
    actorId: string,
    teamId: string,
  ): Promise<boolean> {
    if (await isGlobalAdmin(actorId)) return true;

    const [team] = await db
      .select({ ownerId: teams.ownerId })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (!team) return false;
    if (team.ownerId === actorId) return true;

    const [member] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, actorId)),
      )
      .limit(1);

    return member?.role === "admin";
  }
}
