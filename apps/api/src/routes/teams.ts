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
import {
  isGlobalAdmin,
  requireUuidParams,
  isUuid,
  canViewTeam,
} from "../middleware/access.js";
import { normalizeEmail } from "../lib/address.js";
import { cleanString, escapeLike, clampInt } from "../lib/validate.js";

type TeamRole = "admin" | "member";

/** undefined → "member"; anything other than admin/member → null. */
function parseRole(role: unknown): TeamRole | null {
  if (role === undefined) return "member";
  return role === "admin" || role === "member" ? role : null;
}

export function registerTeamRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);
  const teamGuard = [authGuard, requireUuidParams];

  // ─── List teams ──────────────────────────────────────────
  // Admins see all teams; regular users see only teams they belong to.
  app.get("/api/teams", { preHandler: teamGuard }, async (request) => {
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
    { preHandler: teamGuard },
    async (request, reply) => {
      const name = cleanString(request.body?.name, 255);
      if (!name) {
        return reply
          .status(400)
          .send({ error: "Team name is required (max 255 characters)" });
      }

      const [team] = await db
        .insert(teams)
        .values({ name, ownerId: request.user!.userId })
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
    { preHandler: teamGuard },
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
    { preHandler: teamGuard },
    async (request, reply) => {
      const userId = request.user!.userId;
      const teamId = request.params.id;

      if (!(await canManageTeam(userId, teamId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

      const name = cleanString(request.body?.name, 255);
      if (!name) {
        return reply
          .status(400)
          .send({ error: "Team name is required (max 255 characters)" });
      }
      const updates = { name, updatedAt: new Date() };

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
    { preHandler: teamGuard },
    async (request, reply) => {
      const userId = request.user!.userId;
      const teamId = request.params.id;

      // Deleting a team is destructive: owner or global admin only, not
      // team-level admins.
      const [owned] = await db
        .select({ ownerId: teams.ownerId })
        .from(teams)
        .where(eq(teams.id, teamId))
        .limit(1);
      if (owned && owned.ownerId !== userId && !(await isGlobalAdmin(userId))) {
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
    { preHandler: teamGuard },
    async (request, reply) => {
      const userId = request.user!.userId;
      const teamId = request.params.id;

      if (!(await canViewTeam(userId, teamId))) {
        return reply.status(404).send({ error: "Team not found" });
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
    { preHandler: teamGuard },
    async (request, reply) => {
      const actorId = request.user!.userId;
      const teamId = request.params.id;
      const { userId: targetUserId, role } = request.body ?? {};

      if (!isUuid(targetUserId)) {
        return reply.status(400).send({ error: "A valid userId is required" });
      }
      const memberRole = parseRole(role);
      if (!memberRole) {
        return reply
          .status(400)
          .send({ error: "role must be admin or member" });
      }

      if (!(await canManageTeam(actorId, teamId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

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
    { preHandler: teamGuard },
    async (request, reply) => {
      const actorId = request.user!.userId;
      const teamId = request.params.id;
      const targetUserId = request.params.userId;
      const role = request.body?.role;

      if (role !== "admin" && role !== "member") {
        return reply
          .status(400)
          .send({ error: "role must be admin or member" });
      }
      const memberRole: TeamRole = role;

      if (!(await canManageTeam(actorId, teamId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }
      if (await isTeamOwner(teamId, targetUserId)) {
        return reply
          .status(400)
          .send({ error: "The team owner's membership can't be changed" });
      }

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
    { preHandler: teamGuard },
    async (request, reply) => {
      const actorId = request.user!.userId;
      const teamId = request.params.id;
      const targetUserId = request.params.userId;

      if (!(await canManageTeam(actorId, teamId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }
      if (await isTeamOwner(teamId, targetUserId)) {
        return reply
          .status(400)
          .send({ error: "The team owner can't be removed from the team" });
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
    { preHandler: teamGuard },
    async (request, reply) => {
      const query =
        typeof request.query.q === "string" ? request.query.q.trim() : "";
      if (query.length < 2 || query.length > 100) {
        return reply.status(400).send({
          error: "Search query must be between 2 and 100 characters",
        });
      }

      // The user directory is only exposed to people who can add members.
      if (!(await canManageAnyTeam(request.user!.userId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

      const term = `%${escapeLike(query)}%`;
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
    { preHandler: teamGuard },
    async (request, reply) => {
      const userId = request.user!.userId;
      const teamId = request.params.id;

      if (!(await canViewTeam(userId, teamId))) {
        return reply.status(404).send({ error: "Team not found" });
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
    { preHandler: teamGuard },
    async (request, reply) => {
      const userId = request.user!.userId;
      const teamId = request.params.id;
      const limit = clampInt(request.query.limit, 50, 100);

      if (!(await canViewTeam(userId, teamId))) {
        return reply.status(404).send({ error: "Team not found" });
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
    { preHandler: teamGuard },
    async (request, reply) => {
      const actorId = request.user!.userId;
      const teamId = request.params.id;
      const email = normalizeEmail(request.body?.email);
      const inviteRole = parseRole(request.body?.role);

      if (!email || email.length > 255) {
        return reply
          .status(400)
          .send({ error: "A valid email address is required" });
      }
      if (!inviteRole) {
        return reply
          .status(400)
          .send({ error: "role must be admin or member" });
      }

      if (!(await canManageTeam(actorId, teamId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

      // Check if user already a member
      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
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
            eq(teamInvitations.email, email),
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
          email: email,
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
        meta: { email: email, role: inviteRole },
      });

      return reply.status(201).send(invitation);
    },
  );

  // ─── List team invitations ──────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/teams/:id/invitations",
    { preHandler: teamGuard },
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
    { preHandler: teamGuard },
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
    { preHandler: teamGuard },
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
            eq(teamInvitations.email, user.email.toLowerCase()),
            gt(teamInvitations.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(teamInvitations.createdAt));
    },
  );

  // ─── Accept team invitation ─────────────────────────────
  app.post<{ Params: { invitationId: string } }>(
    "/api/teams/invitations/:invitationId/accept",
    { preHandler: teamGuard },
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
            eq(teamInvitations.email, user.email.toLowerCase()),
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

      // Add as team member (a concurrent accept can lose the race)
      const [added] = await db
        .insert(teamMembers)
        .values({
          teamId: invitation.teamId,
          userId,
          role: invitation.role,
        })
        .onConflictDoNothing()
        .returning({ id: teamMembers.id });
      if (!added) {
        return reply
          .status(409)
          .send({ error: "You are already a member of this team" });
      }

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
    { preHandler: teamGuard },
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
            eq(teamInvitations.email, user.email.toLowerCase()),
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
    { preHandler: teamGuard },
    async (request, reply) => {
      const userId = request.user!.userId;
      if (!(await isGlobalAdmin(userId))) {
        return reply.status(403).send({ error: "Not authorized" });
      }

      const page = clampInt(request.query.page, 1, 1_000_000);
      const limit = clampInt(request.query.limit, 20, 100);
      const offset = (page - 1) * limit;
      const search =
        typeof request.query.search === "string"
          ? request.query.search.trim()
          : "";

      const conditions = search
        ? ilike(teams.name, `%${escapeLike(search)}%`)
        : undefined;

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

  async function isTeamOwner(teamId: string, userId: string): Promise<boolean> {
    const [team] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.ownerId, userId)))
      .limit(1);
    return !!team;
  }

  // Global admin, or owner/admin of at least one team
  async function canManageAnyTeam(userId: string): Promise<boolean> {
    if (await isGlobalAdmin(userId)) return true;
    const [owned] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.ownerId, userId))
      .limit(1);
    if (owned) return true;
    const [admin] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.role, "admin")))
      .limit(1);
    return !!admin;
  }

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
