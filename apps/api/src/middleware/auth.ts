import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getEnv } from "@mailpocket/env";
import { getDb, apiKeys, users } from "@mailpocket/db";
import { eq } from "drizzle-orm";

export interface JwtPayload {
  userId: string;
  email: string;
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

    const email = (decoded.email as string) || "";
    if (!email) return null;

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
  if (!header?.startsWith("Bearer ")) {
    return reply
      .status(401)
      .send({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice(7);

  // API key authentication
  if (token.startsWith("smtps_")) {
    const env = getEnv();
    const db = getDb(env.DATABASE_URL);

    const prefix = token.slice(0, 14);
    const candidates = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.prefix, prefix))
      .limit(5);

    for (const key of candidates) {
      if (key.expiresAt && new Date(key.expiresAt) < new Date()) continue;
      const match = await bcrypt.compare(token, key.keyHash);
      if (match) {
        request.user = { userId: key.userId, email: "" };
        request.apiKeyScopes = key.scopes;
        db.update(apiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiKeys.id, key.id))
          .catch(() => {});
        return;
      }
    }
    return reply.status(401).send({ error: "Invalid API key" });
  }

  // JWT authentication (local tokens)
  try {
    request.user = verifyToken(token);
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
