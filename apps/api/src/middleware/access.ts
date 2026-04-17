import type { FastifyRequest, FastifyReply } from "fastify";
import {
  getDb,
  inboxes,
  inboxMembers,
  teams,
  teamMembers,
  users,
} from "@mailpocket/db";
import { eq, and } from "drizzle-orm";
import { getEnv } from "@mailpocket/env";

export type InboxRole = "owner" | "editor" | "viewer";
export type TeamRole = "admin" | "member";
export type GlobalRole = "admin" | "user";

/**
 * Resolve the effective role a user has on an inbox.
 * Priority: global admin > inbox creator > inbox_members role > team membership.
 * Returns null if no access.
 */
export async function resolveInboxRole(
  userId: string,
  inboxId: string,
): Promise<InboxRole | null> {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // 1. Global admin bypass — admin can access everything as owner
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.role === "admin") return "owner";

  // 2. Direct inbox ownership
  const [inbox] = await db
    .select({ userId: inboxes.userId, teamId: inboxes.teamId })
    .from(inboxes)
    .where(eq(inboxes.id, inboxId))
    .limit(1);

  if (!inbox) return null;
  if (inbox.userId === userId) return "owner";

  // 3. Explicit inbox membership
  const [member] = await db
    .select({ role: inboxMembers.role })
    .from(inboxMembers)
    .where(
      and(eq(inboxMembers.inboxId, inboxId), eq(inboxMembers.userId, userId)),
    )
    .limit(1);

  if (member) return member.role as InboxRole;

  // 4. Team membership — team admins get editor, team members get viewer
  if (inbox.teamId) {
    const [tm] = await db
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, inbox.teamId),
          eq(teamMembers.userId, userId),
        ),
      )
      .limit(1);

    if (tm) {
      return tm.role === "admin" ? "editor" : "viewer";
    }
  }

  return null;
}

/**
 * Check if a user has at least the required role on an inbox.
 * Role hierarchy: owner > editor > viewer
 */
const ROLE_WEIGHT: Record<InboxRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

export function hasMinRole(
  actual: InboxRole | null,
  required: InboxRole,
): boolean {
  if (!actual) return false;
  return ROLE_WEIGHT[actual] >= ROLE_WEIGHT[required];
}

/**
 * Fastify preHandler factory — checks the user has at least `minRole` on `:id` or `:inboxId`.
 * Attaches `request.inboxRole` with the resolved role.
 */
declare module "fastify" {
  interface FastifyRequest {
    inboxRole?: InboxRole;
  }
}

export function requireInboxRole(minRole: InboxRole) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const inboxId = params.id ?? params.inboxId;

    if (!inboxId) {
      return reply.status(400).send({ error: "Missing inbox identifier" });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const role = await resolveInboxRole(userId, inboxId);
    if (!hasMinRole(role, minRole)) {
      return reply.status(404).send({ error: "Inbox not found" });
    }

    request.inboxRole = role!;
  };
}

/**
 * Check if user has global admin role.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user?.userId;
  if (!userId) {
    return reply.status(401).send({ error: "Authentication required" });
  }

  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user?.role !== "admin") {
    return reply.status(403).send({ error: "Admin access required" });
  }
}

/**
 * Check if the authenticated user is either the resource owner or a global admin.
 * Useful for user-scoped resources (domains, templates, suppressions, quotas).
 */
export async function isOwnerOrAdmin(
  userId: string,
  resourceOwnerId: string,
): Promise<boolean> {
  if (userId === resourceOwnerId) return true;

  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user?.role === "admin";
}

/**
 * Returns true if the authenticated user is a global admin.
 */
export async function isGlobalAdmin(userId: string): Promise<boolean> {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user?.role === "admin";
}

/**
 * Resolve inbox role for a message-level route.
 * Looks up the message's inboxId, then delegates to resolveInboxRole.
 * Attaches `request.inboxRole` with the resolved role.
 */
export function requireMessageRole(minRole: InboxRole) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as Record<string, string>;
    const messageId = params.id ?? params.messageId;

    if (!messageId) {
      return reply.status(400).send({ error: "Missing message identifier" });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const env = getEnv();
    const db = getDb(env.DATABASE_URL);

    // Import messages table inline to avoid circular dependency
    const { messages } = await import("@mailpocket/db");
    const [msg] = await db
      .select({ inboxId: messages.inboxId })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!msg) {
      return reply.status(404).send({ error: "Message not found" });
    }

    const role = await resolveInboxRole(userId, msg.inboxId);
    if (!hasMinRole(role, minRole)) {
      return reply.status(404).send({ error: "Message not found" });
    }

    request.inboxRole = role!;
  };
}
