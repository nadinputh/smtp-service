import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { getEnv } from "@mailpocket/env";
import { getDb, apiKeys, users } from "@mailpocket/db";
import { eq } from "drizzle-orm";

export const API_KEY_SCOPES = ["send", "read", "delete"] as const;

/** SHA-256 hex of a raw API key; keys are high-entropy so no salt/stretch needed. */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

// API keys are for integrations, not account management: these areas need a
// user session (JWT).
const SESSION_ONLY_PREFIXES = ["/api/keys", "/api/auth", "/api/admin"];

/**
 * Scope an API key needs for a request, or null if keys may not call it.
 * send: POST /v1/messages*, forward. read: GET/HEAD. delete: DELETE.
 */
export function requiredApiKeyScope(
  method: string,
  route: string,
): string | null {
  if (
    SESSION_ONLY_PREFIXES.some((p) => route === p || route.startsWith(`${p}/`))
  ) {
    return null;
  }
  if (method === "GET" || method === "HEAD") return "read";
  if (method === "DELETE") return "delete";
  if (
    method === "POST" &&
    (route.startsWith("/v1/messages") || route.endsWith("/forward"))
  ) {
    return "send";
  }
  return null;
}

export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
    apiKeyScopes?: string[];
  }
}

export function signToken(payload: JwtPayload): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  const env = getEnv();
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

// ─── OAuth2 OIDC Discovery Cache ─────────────────────────
let _oidcConfig: {
  issuer: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
} | null = null;

async function getOidcConfig() {
  if (_oidcConfig) return _oidcConfig;
  const env = getEnv();
  if (!env.OAUTH2_ISSUER_URL)
    throw new Error("OAUTH2_ISSUER_URL not configured");
  const res = await fetch(
    `${env.OAUTH2_ISSUER_URL}/.well-known/openid-configuration`,
  );
  if (!res.ok) throw new Error("Failed to fetch OIDC configuration");
  _oidcConfig = (await res.json()) as typeof _oidcConfig;
  return _oidcConfig!;
}

/**
 * Verify an OAuth2 access/ID token against the OIDC provider JWKS.
 * Looks up user by email (system-level provider, no per-user linking).
 */
async function verifyOAuth2Token(token: string): Promise<JwtPayload | null> {
  try {
    const oidc = await getOidcConfig();

    // Decode header to get key ID
    const header = JSON.parse(
      Buffer.from(token.split(".")[0], "base64url").toString(),
    );

    // Fetch JWKS
    const jwksRes = await fetch(oidc.jwks_uri);
    if (!jwksRes.ok) return null;
    const jwks = (await jwksRes.json()) as { keys: any[] };

    const signingKey = jwks.keys.find(
      (k: any) => k.kid === header.kid || (!header.kid && k.use === "sig"),
    );
    if (!signingKey) return null;

    // Convert JWK to PEM
    const { createPublicKey } = await import("node:crypto");
    const publicKey = createPublicKey({ key: signingKey, format: "jwk" });
    const pem = publicKey.export({ type: "spki", format: "pem" }) as string;

    const env = getEnv();
    const decoded = jwt.verify(token, pem, {
      issuer: oidc.issuer,
      audience: env.OAUTH2_CLIENT_ID,
    }) as any;

    const email =
      typeof decoded.email === "string"
        ? decoded.email.trim().toLowerCase()
        : "";
    // An unverified address must not be able to claim an existing account.
    if (!email || decoded.email_verified === false) return null;

    // Look up user by email
    const db = getDb(env.DATABASE_URL);
    let [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // Auto-provision user from OAuth2
      [user] = await db
        .insert(users)
        .values({
          email,
          name: (decoded.name as string) || null,
        })
        .onConflictDoNothing()
        .returning({ id: users.id, email: users.email });
    }

    if (!user) return null;
    return { userId: user.id, email: user.email };
  } catch {
    return null;
  }
}

export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  const xApiKey = request.headers["x-api-key"];

  let token: string | undefined;
  if (header?.startsWith("Bearer ")) {
    token = header.slice(7);
  } else if (typeof xApiKey === "string" && xApiKey.trim()) {
    token = xApiKey.trim();
  }

  if (!token) {
    return reply
      .status(401)
      .send({ error: "Missing or invalid Authorization header" });
  }

  // API key authentication
  if (token.startsWith("smtps_")) {
    const env = getEnv();
    const db = getDb(env.DATABASE_URL);

    // Current keys are stored as a SHA-256 digest (direct lookup); keys
    // created before that were bcrypt-hashed and are matched by prefix.
    let key = (
      await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, hashApiKey(token)))
        .limit(1)
    )[0];

    if (!key) {
      const candidates = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.prefix, token.slice(0, 14)))
        .limit(5);
      for (const candidate of candidates) {
        if (
          candidate.keyHash.startsWith("$2") &&
          (await bcrypt.compare(token, candidate.keyHash))
        ) {
          key = candidate;
          break;
        }
      }
    }

    if (!key || (key.expiresAt && new Date(key.expiresAt) < new Date())) {
      return reply.status(401).send({ error: "Invalid API key" });
    }

    const scope = requiredApiKeyScope(
      request.method,
      request.routeOptions?.url ?? request.url.split("?")[0],
    );
    if (!scope || !key.scopes.includes(scope)) {
      return reply.status(403).send({
        error: scope
          ? `Insufficient scope. Required: ${scope}`
          : "This endpoint requires a user session, not an API key",
      });
    }

    request.user = { userId: key.userId, email: "" };
    request.apiKeyScopes = key.scopes;
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))
      .catch(() => {});
    return;
  }

  // JWT authentication (local tokens)
  try {
    const payload = verifyToken(token);
    // Ensure the user referenced by the JWT still exists. A valid signature
    // is not enough — the user row may have been deleted (or the DB reset)
    // while the client still holds the token. Without this check, downstream
    // inserts referencing user_id would fail with FK violations.
    const env = getEnv();
    const db = getDb(env.DATABASE_URL);
    const [u] = await db
      .select({ id: users.id, passwordChangedAt: users.passwordChangedAt })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);
    if (!u) {
      return reply.status(401).send({ error: "Invalid or expired token" });
    }
    // A password change/reset ends every session issued before it.
    if (
      u.passwordChangedAt &&
      (payload.iat ?? 0) < Math.floor(u.passwordChangedAt.getTime() / 1000)
    ) {
      return reply.status(401).send({ error: "Invalid or expired token" });
    }
    request.user = payload;
    return;
  } catch {
    // Not a valid local JWT — try OAuth2 if enabled
  }

  // OAuth2 token verification (system-level provider)
  const env = getEnv();
  if (env.OAUTH2_ENABLED) {
    const oauthUser = await verifyOAuth2Token(token);
    if (oauthUser) {
      request.user = oauthUser;
      return;
    }
  }

  return reply.status(401).send({ error: "Invalid or expired token" });
}

export function requireScopes(...scopes: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.apiKeyScopes) return;
    const hasScope = scopes.some((s) => request.apiKeyScopes!.includes(s));
    if (!hasScope) {
      return reply.status(403).send({
        error: `Insufficient scope. Required: ${scopes.join(" or ")}`,
      });
    }
  };
}
