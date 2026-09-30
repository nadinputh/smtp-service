import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { getEnv } from "@mailpocket/env";
import { getDb, apiKeys } from "@mailpocket/db";
import { eq, and } from "drizzle-orm";
import { authGuard, hashApiKey, API_KEY_SCOPES } from "../middleware/auth.js";
import { isUuid } from "../middleware/access.js";
import { cleanString } from "../lib/validate.js";

export function registerApiKeyRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  // List API keys (never expose full key)
  app.get("/api/keys", { preHandler: authGuard }, async (request) => {
    return await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, request.user!.userId));
  });

  // Create API key
  app.post<{
    Body: { name: string; scopes: string[]; expiresAt?: string };
  }>("/api/keys", { preHandler: authGuard }, async (request, reply) => {
    const body = request.body ?? ({} as Record<string, unknown>);
    const name = cleanString(body.name, 255);

    if (!name || !Array.isArray(body.scopes) || !body.scopes.length) {
      return reply.status(400).send({ error: "name and scopes are required" });
    }

    const scopes = [...new Set(body.scopes)] as string[];
    const invalidScopes = scopes.filter(
      (s) => !(API_KEY_SCOPES as readonly unknown[]).includes(s),
    );
    if (invalidScopes.length) {
      return reply.status(400).send({
        error: `Invalid scopes: ${invalidScopes.map(String).join(", ")}`,
      });
    }

    let expiresAt: Date | null = null;
    if (body.expiresAt !== undefined && body.expiresAt !== null) {
      expiresAt =
        typeof body.expiresAt === "string" ? new Date(body.expiresAt) : null;
      if (!expiresAt || isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        return reply
          .status(400)
          .send({ error: "expiresAt must be a future ISO 8601 timestamp" });
      }
    }

    // Generate key: smtps_live_<32 hex chars>
    const hex = randomBytes(16).toString("hex");
    const rawKey = `smtps_live_${hex}`;
    const prefix = rawKey.slice(0, 14);
    const keyHash = hashApiKey(rawKey);

    const [created] = await db
      .insert(apiKeys)
      .values({
        userId: request.user!.userId,
        name,
        keyHash,
        prefix,
        scopes,
        expiresAt,
      })
      .returning();

    return reply.status(201).send({
      id: created.id,
      name: created.name,
      prefix: created.prefix,
      scopes: created.scopes,
      lastUsedAt: created.lastUsedAt,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
      rawKey, // shown only once
    });
  });

  // Delete API key
  app.delete<{ Params: { id: string } }>(
    "/api/keys/:id",
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = request.params;

      if (!isUuid(id)) {
        return reply.status(404).send({ error: "API key not found" });
      }

      const deleted = await db
        .delete(apiKeys)
        .where(
          and(eq(apiKeys.id, id), eq(apiKeys.userId, request.user!.userId)),
        )
        .returning({ id: apiKeys.id });

      if (!deleted.length) {
        return reply.status(404).send({ error: "API key not found" });
      }
      return { success: true };
    },
  );
}
