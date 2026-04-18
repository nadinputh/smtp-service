import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import {
  getDb,
  teams,
  teamMembers,
  teamActivityLog,
  teamInvitations,
  inboxes,
  users,
} from "@mailpocket/db";
import { eq, and, inArray, or, ilike, desc, gt, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
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

      // Log activity
      await db.insert(teamActivityLog).values({
        teamId: team.id,
        actorId: request.user!.userId,
        action: "team_created",
        meta: { teamName: team.name },
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

      // Determine user's role in this team
      let currentUserRole: string | null = null;
      const admin = await isGlobalAdmin(userId);

      if (admin) {
        currentUserRole = "owner"; // global admins get full access
      } else if (team.ownerId === userId) {
        currentUserRole = "owner";
      } else {
        const [member] = await db
          .select({ role: teamMembers.role })
          .from(teamMembers)
          .where(
            and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
          )
          .limit(1);

        if (!member) {
          return reply.status(404).send({ error: "Team not found" });
        }
        currentUserRole = member.role; // "admin" or "member"
      }

      return { ...team, currentUserRole };
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

      // Log activity
      await db.insert(teamActivityLog).values({
        teamId,
        actorId: userId,
        action: "team_updated",
        meta: { name: updates.name },
      });

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

        // Log activity
        await db.insert(teamActivityLog).values({
          teamId,
          actorId: actorId,
          action: "member_added",
          meta: { userId: targetUserId, role: memberRole },
        });

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

      // Log activity
      await db.insert(teamActivityLog).values({
        teamId,
        actorId,
        action: "member_role_changed",
        meta: { userId: targetUserId, role: memberRole },
      });

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

      // Log activity
      await db.insert(teamActivityLog).values({
        teamId,
        actorId,
        action: "member_removed",
        meta: { userId: targetUserId },
      });

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

  // ─── List team inboxes ───────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/teams/:id/inboxes",
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
          id: inboxes.id,
          name: inboxes.name,
          smtpUsername: inboxes.smtpUsername,
          createdAt: inboxes.createdAt,
        })
        .from(inboxes)
        .where(eq(inboxes.teamId, teamId));
    },
  );

  // ─── Team activity log ──────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/api/teams/:id/activity",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const teamId = request.params.id;
      const limit = Math.min(
        parseInt(request.query.limit || "50", 10) || 50,
        100,
      );

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
          id: teamActivityLog.id,
          action: teamActivityLog.action,
          meta: teamActivityLog.meta,
          createdAt: teamActivityLog.createdAt,
          actorEmail: users.email,
          actorName: users.name,
        })
        .from(teamActivityLog)
        .innerJoin(users, eq(teamActivityLog.actorId, users.id))
        .where(eq(teamActivityLog.teamId, teamId))
        .orderBy(desc(teamActivityLog.createdAt))
        .limit(limit);
    },
  );

  // ─── Send team invitation ───────────────────────────────
  app.post<{
    Params: { id: string };
    Body: { email: string; role?: string };
  }>(
    "/api/teams/:id/invitations",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const actorId = request.user!.userId;
      const teamId = request.params.id;
      const { email, role } = request.body;

      if (!email?.trim()) {
        return reply.status(400).send({ error: "Email is required" });
      }

      if (!(await canManageTeam(actorId, teamId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

      const inviteRole = role === "admin" ? "admin" : "member";

      // Check if user already a member
      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()))
        .limit(1);

      if (existingUser) {
        const [existingMember] = await db
          .select()
          .from(teamMembers)
          .where(
            and(
              eq(teamMembers.teamId, teamId),
              eq(teamMembers.userId, existingUser.id),
            ),
          )
          .limit(1);

        if (existingMember) {
          return reply
            .status(409)
            .send({ error: "User is already a team member" });
        }
      }

      // Check for existing pending invitation
      const [existingInvite] = await db
        .select()
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.teamId, teamId),
            eq(teamInvitations.email, email.trim().toLowerCase()),
            gt(teamInvitations.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (existingInvite) {
        return reply
          .status(409)
          .send({ error: "An invitation is already pending for this email" });
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const [invitation] = await db
        .insert(teamInvitations)
        .values({
          teamId,
          email: email.trim().toLowerCase(),
          role: inviteRole,
          token,
          invitedBy: actorId,
          expiresAt,
        })
        .returning();

      // Log activity
      await db.insert(teamActivityLog).values({
        teamId,
        actorId,
        action: "invitation_sent",
        meta: { email: email.trim().toLowerCase(), role: inviteRole },
      });

      return reply.status(201).send(invitation);
    },
  );

  // ─── List team invitations ──────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/teams/:id/invitations",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const teamId = request.params.id;

      const admin = await isGlobalAdmin(userId);
      if (!admin && !(await canManageTeam(userId, teamId))) {
        // Regular members can see invitations but only managers can create/delete
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

      return db
        .select({
          id: teamInvitations.id,
          email: teamInvitations.email,
          role: teamInvitations.role,
          expiresAt: teamInvitations.expiresAt,
          createdAt: teamInvitations.createdAt,
          inviterEmail: users.email,
          inviterName: users.name,
        })
        .from(teamInvitations)
        .innerJoin(users, eq(teamInvitations.invitedBy, users.id))
        .where(
          and(
            eq(teamInvitations.teamId, teamId),
            gt(teamInvitations.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(teamInvitations.createdAt));
    },
  );

  // ─── Revoke team invitation ─────────────────────────────
  app.delete<{ Params: { id: string; invitationId: string } }>(
    "/api/teams/:id/invitations/:invitationId",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const actorId = request.user!.userId;
      const teamId = request.params.id;
      const invitationId = request.params.invitationId;

      if (!(await canManageTeam(actorId, teamId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

      const [deleted] = await db
        .delete(teamInvitations)
        .where(
          and(
            eq(teamInvitations.id, invitationId),
            eq(teamInvitations.teamId, teamId),
          ),
        )
        .returning({ email: teamInvitations.email });

      if (!deleted) {
        return reply.status(404).send({ error: "Invitation not found" });
      }

      return reply.status(204).send();
    },
  );

  // ─── Get my pending invitations ─────────────────────────
  app.get(
    "/api/teams/my-invitations",
    { preHandler: [authGuard] },
    async (request) => {
      const userId = request.user!.userId;

      // Get user email
      const [user] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) return [];

      return db
        .select({
          id: teamInvitations.id,
          teamId: teamInvitations.teamId,
          teamName: teams.name,
          role: teamInvitations.role,
          expiresAt: teamInvitations.expiresAt,
          createdAt: teamInvitations.createdAt,
          inviterEmail: users.email,
          inviterName: users.name,
        })
        .from(teamInvitations)
        .innerJoin(teams, eq(teamInvitations.teamId, teams.id))
        .innerJoin(users, eq(teamInvitations.invitedBy, users.id))
        .where(
          and(
            eq(teamInvitations.email, user.email),
            gt(teamInvitations.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(teamInvitations.createdAt));
    },
  );

  // ─── Accept team invitation ─────────────────────────────
  app.post<{ Params: { invitationId: string } }>(
    "/api/teams/invitations/:invitationId/accept",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const invitationId = request.params.invitationId;

      // Get user email
      const [user] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(401).send({ error: "User not found" });
      }

      // Find invitation
      const [invitation] = await db
        .select()
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.id, invitationId),
            eq(teamInvitations.email, user.email),
            gt(teamInvitations.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (!invitation) {
        return reply
          .status(404)
          .send({ error: "Invitation not found or expired" });
      }

      // Check if already a member
      const [existingMember] = await db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, invitation.teamId),
            eq(teamMembers.userId, userId),
          ),
        )
        .limit(1);

      if (existingMember) {
        // Already a member, just delete the invitation
        await db
          .delete(teamInvitations)
          .where(eq(teamInvitations.id, invitationId));
        return reply
          .status(409)
          .send({ error: "You are already a member of this team" });
      }

      // Add as team member
      await db.insert(teamMembers).values({
        teamId: invitation.teamId,
        userId,
        role: invitation.role,
      });

      // Delete invitation
      await db
        .delete(teamInvitations)
        .where(eq(teamInvitations.id, invitationId));

      // Log activity
      await db.insert(teamActivityLog).values({
        teamId: invitation.teamId,
        actorId: userId,
        action: "invitation_accepted",
        meta: { email: user.email, role: invitation.role },
      });

      return { success: true, teamId: invitation.teamId };
    },
  );

  // ─── Decline team invitation ────────────────────────────
  app.delete<{ Params: { invitationId: string } }>(
    "/api/teams/invitations/:invitationId",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const invitationId = request.params.invitationId;

      // Get user email
      const [user] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(401).send({ error: "User not found" });
      }

      const [deleted] = await db
        .delete(teamInvitations)
        .where(
          and(
            eq(teamInvitations.id, invitationId),
            eq(teamInvitations.email, user.email),
          ),
        )
        .returning({ id: teamInvitations.id });

      if (!deleted) {
        return reply.status(404).send({ error: "Invitation not found" });
      }

      return reply.status(204).send();
    },
  );

  // ─── Admin: list all teams ──────────────────────────────
  app.get<{ Querystring: { page?: string; limit?: string; search?: string } }>(
    "/api/admin/teams",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const userId = request.user!.userId;
      if (!(await isGlobalAdmin(userId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

      const page = Math.max(1, parseInt(request.query.page || "1", 10) || 1);
      const limit = Math.min(
        parseInt(request.query.limit || "20", 10) || 20,
        100,
      );
      const offset = (page - 1) * limit;
      const search = request.query.search?.trim();

      const conditions = search ? ilike(teams.name, `%${search}%`) : undefined;

      const [{ count: total }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(teams)
        .where(conditions);

      const data = await db
        .select({
          id: teams.id,
          name: teams.name,
          ownerId: teams.ownerId,
          ownerEmail: users.email,
          ownerName: users.name,
          createdAt: teams.createdAt,
          memberCount: sql<number>`(SELECT count(*)::int FROM team_members WHERE team_id = ${teams.id})`,
        })
        .from(teams)
        .innerJoin(users, eq(teams.ownerId, users.id))
        .where(conditions)
        .orderBy(desc(teams.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        data,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      };
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
