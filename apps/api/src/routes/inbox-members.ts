import type { FastifyInstance } from "fastify";
import { getEnv } from "@mailpocket/env";
import { getDb, inboxes, inboxMembers, users } from "@mailpocket/db";
import { eq, and } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { requireInboxRole, requireUuidParams } from "../middleware/access.js";
import { normalizeEmail } from "../lib/address.js";

export function registerInboxMemberRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // ─── List members ──────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/inboxes/:id/members",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("viewer")] },
    async (request, reply) => {
      const { id } = request.params;

      const members = await db
        .select({
          id: inboxMembers.id,
          userId: inboxMembers.userId,
          role: inboxMembers.role,
          email: users.email,
          name: users.name,
          createdAt: inboxMembers.createdAt,
        })
        .from(inboxMembers)
        .innerJoin(users, eq(users.id, inboxMembers.userId))
        .where(eq(inboxMembers.inboxId, id));

      // Also include original owner (from inboxes.userId)
      const [inbox] = await db
        .select({ userId: inboxes.userId })
        .from(inboxes)
        .where(eq(inboxes.id, id))
        .limit(1);

      if (inbox) {
        const isOwnerInMembers = members.some((m) => m.userId === inbox.userId);
        if (!isOwnerInMembers) {
          const [ownerUser] = await db
            .select({ email: users.email, name: users.name })
            .from(users)
            .where(eq(users.id, inbox.userId))
            .limit(1);
          if (ownerUser) {
            members.unshift({
              id: "owner",
              userId: inbox.userId,
              role: "owner",
              email: ownerUser.email,
              name: ownerUser.name,
              createdAt: new Date(),
            });
          }
        }
      }

      return members;
    },
  );

  // ─── Add member (invite by email) ──────────────────────
  app.post<{ Params: { id: string }; Body: { email: string; role?: string } }>(
    "/api/inboxes/:id/members",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("owner")] },
    async (request, reply) => {
      const { id } = request.params;
      const { role = "viewer" } = request.body ?? {};
      const email = normalizeEmail(request.body?.email);

      if (!email) {
        return reply
          .status(400)
          .send({ error: "A valid email address is required" });
      }

      if (!["editor", "viewer"].includes(role)) {
        return reply
          .status(400)
          .send({ error: "role must be editor or viewer" });
      }

      // Find user by email
      const [targetUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!targetUser) {
        return reply
          .status(404)
          .send({ error: "User not found. They must register first." });
      }

      const [inbox] = await db
        .select({ userId: inboxes.userId })
        .from(inboxes)
        .where(eq(inboxes.id, id))
        .limit(1);

      if (targetUser.id === inbox?.userId) {
        return reply
          .status(400)
          .send({ error: "That user already owns this inbox" });
      }

      // Upsert member
      const [member] = await db
        .insert(inboxMembers)
        .values({
          inboxId: id,
          userId: targetUser.id,
          role,
        })
        .onConflictDoUpdate({
          target: [inboxMembers.inboxId, inboxMembers.userId],
          set: { role },
        })
        .returning();

      return member;
    },
  );

  // ─── Update member role ─────────────────────────────────
  app.put<{
    Params: { id: string; memberId: string };
    Body: { role: string };
  }>(
    "/api/inboxes/:id/members/:memberId",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("owner")] },
    async (request, reply) => {
      const { id, memberId } = request.params;
      const role = request.body?.role;

      if (role !== "editor" && role !== "viewer") {
        return reply
          .status(400)
          .send({ error: "role must be editor or viewer" });
      }

      const [updated] = await db
        .update(inboxMembers)
        .set({ role })
        .where(and(eq(inboxMembers.id, memberId), eq(inboxMembers.inboxId, id)))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: "Member not found" });
      }

      return updated;
    },
  );

  // ─── Remove member ─────────────────────────────────────
  app.delete<{ Params: { id: string; memberId: string } }>(
    "/api/inboxes/:id/members/:memberId",
    { preHandler: [authGuard, requireUuidParams, requireInboxRole("owner")] },
    async (request, reply) => {
      const { id, memberId } = request.params;

      const result = await db
        .delete(inboxMembers)
        .where(and(eq(inboxMembers.id, memberId), eq(inboxMembers.inboxId, id)))
        .returning({ id: inboxMembers.id });

      if (!result.length) {
        return reply.status(404).send({ error: "Member not found" });
      }

      return { success: true };
    },
  );
}
