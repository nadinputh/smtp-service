import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { getEnv } from "@mailpocket/env";
import { getDb, apiKeys, users } from "@mailpocket/db";
import { eq, and, like } from "drizzle-orm";
import { resolveSsoUser, emailClaimTrusted } from "../lib/sso-user.js";
import { isTokenRevoked } from "../lib/revocation.js";

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
  exp?: number;
  /** Unique id of a locally issued token, used to revoke it on logout. */
  jti?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
    apiKeyScopes?: string[];
    apiKeyId?: string;
  }
}

export function signToken(payload: Pick<JwtPayload, "userId" | "email">): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "7d",
    jwtid: randomUUID(),
  });
}

/**
 * Whether a verified session token is still honoured: its user exists, no
 * password change happened after it was issued, and it wasn't logged out.
 */
export async function isSessionActive(payload: JwtPayload): Promise<boolean> {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);
  const [u] = await db
    .select({ id: users.id, passwordChangedAt: users.passwordChangedAt })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);
  if (!u) return false;
  if (
    u.passwordChangedAt &&
    (payload.iat ?? 0) < Math.floor(u.passwordChangedAt.getTime() / 1000)
  ) {
    return false;
  }
  return !payload.jti || !(await isTokenRevoked(payload.jti));
}

export function verifyToken(token: string): JwtPayload {
  const env = getEnv();
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
  }) as JwtPayload;
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
      // Asymmetric only: never let a token pick an HMAC "verified" with a public key
      algorithms: [
        "RS256", "RS384", "RS512", "ES256", "ES384", "ES512",
        "PS256", "PS384", "PS512",
      ],
    }) as any;

    const email =
      typeof decoded.email === "string"
        ? decoded.email.trim().toLowerCase()
        : "";
    // An unverified address must not be able to claim an existing account.
    if (
      !email ||
      !emailClaimTrusted(
        decoded.email_verified,
        env.OAUTH2_ALLOW_UNVERIFIED_EMAIL,
      )
    ) {
      return null;
    }

    const db = getDb(env.DATABASE_URL);
    const resolved = await resolveSsoUser(
      db,
      email,
      typeof decoded.name === "string" ? decoded.name : null,
    );
    if ("error" in resolved) return null;
    return { userId: resolved.user.id, email: resolved.user.email };
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
    // created before that were bcrypt-hashed and are matched by prefix, then
    // upgraded to SHA-256 so each legacy key is only ever slow once.
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
        .where(
          and(
            eq(apiKeys.prefix, token.slice(0, 14)),
            // Only bcrypt rows: SHA-256 keys sharing the prefix must not
            // use up the candidate slots.
            like(apiKeys.keyHash, "$2%"),
          ),
        )
        .limit(5);
      for (const candidate of candidates) {
        if (
          candidate.keyHash.startsWith("$2") &&
          (await bcrypt.compare(token, candidate.keyHash))
        ) {
          key = candidate;
          await db
            .update(apiKeys)
            .set({ keyHash: hashApiKey(token) })
            .where(eq(apiKeys.id, candidate.id));
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
    request.apiKeyId = key.id;
    // Once a minute is precise enough for "last used" and spares a write on
    // every request.
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, key.id))
        .catch(() => {});
    }
    return;
  }

  // JWT authentication (local tokens)
  try {
    const payload = verifyToken(token);
    // A valid signature is not enough: the user may be gone, have changed
    // their password, or have logged this token out.
    if (!(await isSessionActive(payload))) {
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
