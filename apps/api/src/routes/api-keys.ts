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

  // Validated scopes, or an error message.
  function parseScopes(
    input: unknown,
  ): { scopes: string[] } | { error: string } {
    if (!Array.isArray(input) || !input.length) {
      return { error: "name and scopes are required" };
    }
    const scopes = [...new Set(input)] as string[];
    const invalid = scopes.filter(
      (s) => !(API_KEY_SCOPES as readonly unknown[]).includes(s),
    );
    return invalid.length
      ? { error: `Invalid scopes: ${invalid.map(String).join(", ")}` }
      : { scopes };
  }

  // A future expiry date, or an error message.
  function parseExpiry(
    input: unknown,
  ): { expiresAt: Date } | { error: string } {
    const expiresAt = typeof input === "string" ? new Date(input) : null;
    return !expiresAt || isNaN(expiresAt.getTime()) || expiresAt <= new Date()
      ? { error: "expiresAt must be a future ISO 8601 timestamp" }
      : { expiresAt };
  }

  // smtps_live_<32 hex chars>; only the hash and display prefix are stored.
  function newKeyMaterial() {
    const rawKey = `smtps_live_${randomBytes(16).toString("hex")}`;
    return {
      rawKey,
      keyHash: hashApiKey(rawKey),
      prefix: rawKey.slice(0, 14),
    };
  }

  const publicFields = (k: typeof apiKeys.$inferSelect) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    createdAt: k.createdAt,
  });

  // Create API key
  app.post<{
    Body: { name: string; scopes: string[]; expiresAt?: string };
  }>("/api/keys", { preHandler: authGuard }, async (request, reply) => {
    const body = request.body ?? ({} as Record<string, unknown>);
    const name = cleanString(body.name, 255);
    const parsedScopes = parseScopes(body.scopes);
    if (!name || "error" in parsedScopes) {
      return reply.status(400).send({
        error:
          "error" in parsedScopes
            ? parsedScopes.error
            : "name and scopes are required",
      });
    }

    let expiresAt: Date | null = null;
    if (body.expiresAt !== undefined && body.expiresAt !== null) {
      const parsed = parseExpiry(body.expiresAt);
      if ("error" in parsed) {
        return reply.status(400).send({ error: parsed.error });
      }
      expiresAt = parsed.expiresAt;
    }

    const { rawKey, keyHash, prefix } = newKeyMaterial();
    const [created] = await db
      .insert(apiKeys)
      .values({
        userId: request.user!.userId,
        name,
        keyHash,
        prefix,
        scopes: parsedScopes.scopes,
        expiresAt,
      })
      .returning();

    return reply.status(201).send({
      ...publicFields(created),
      rawKey, // shown only once
    });
  });

  // Edit name, scopes or expiry (expiresAt: null removes the expiry)
  app.patch<{
    Params: { id: string };
    Body: { name?: string; scopes?: string[]; expiresAt?: string | null };
  }>("/api/keys/:id", { preHandler: authGuard }, async (request, reply) => {
    const { id } = request.params;
    if (!isUuid(id)) {
      return reply.status(404).send({ error: "API key not found" });
    }
    const body = request.body ?? {};
    const changes: Partial<typeof apiKeys.$inferInsert> = {};

    if (body.name !== undefined) {
      const name = cleanString(body.name, 255);
      if (!name) return reply.status(400).send({ error: "name is invalid" });
      changes.name = name;
    }
    if (body.scopes !== undefined) {
      const parsed = parseScopes(body.scopes);
      if ("error" in parsed) {
        return reply.status(400).send({ error: parsed.error });
      }
      changes.scopes = parsed.scopes;
    }
    if (body.expiresAt !== undefined) {
      if (body.expiresAt === null) {
        changes.expiresAt = null;
      } else {
        const parsed = parseExpiry(body.expiresAt);
        if ("error" in parsed) {
          return reply.status(400).send({ error: parsed.error });
        }
        changes.expiresAt = parsed.expiresAt;
      }
    }
    if (Object.keys(changes).length === 0) {
      return reply.status(400).send({ error: "Nothing to update" });
    }

    const [updated] = await db
      .update(apiKeys)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, request.user!.userId)))
      .returning();
    if (!updated) return reply.status(404).send({ error: "API key not found" });
    return publicFields(updated);
  });

  // Rotate: same key record (name, scopes, expiry), new secret. The old
  // secret stops working immediately.
  app.post<{ Params: { id: string } }>(
    "/api/keys/:id/rotate",
    { preHandler: authGuard },
    async (request, reply) => {
      const { id } = request.params;
      if (!isUuid(id)) {
        return reply.status(404).send({ error: "API key not found" });
      }
      const { rawKey, keyHash, prefix } = newKeyMaterial();
      const [rotated] = await db
        .update(apiKeys)
        .set({ keyHash, prefix, lastUsedAt: null, updatedAt: new Date() })
        .where(
          and(eq(apiKeys.id, id), eq(apiKeys.userId, request.user!.userId)),
        )
        .returning();
      if (!rotated) {
        return reply.status(404).send({ error: "API key not found" });
      }
      return { ...publicFields(rotated), rawKey }; // shown only once
    },
  );

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
