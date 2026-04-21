import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { getEnv } from "@mailpocket/env";
import { getDb, users } from "@mailpocket/db";
import { eq } from "drizzle-orm";
import { signToken, authGuard } from "../middleware/auth.js";

export function registerAuthRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);
  const authRateLimit = {
    config: {
      rateLimit: {
        max: env.APP_MODE === "production" ? 10 : 1000,
        timeWindow: 60000,
      },
    },
  };

  // ─── Register (local) ────────────────────────────────────
  app.post<{
    Body: { email: string; password: string; name?: string };
  }>("/api/auth/register", authRateLimit, async (request, reply) => {
    const { email, password, name } = request.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email ||
      !password
    ) {
      return reply
        .status(400)
        .send({ error: "Email and password are required" });
    }

    if (email.includes("\x00") || password.includes("\x00")) {
      return reply.status(400).send({ error: "Invalid credentials format" });
    }

    // Password strength validation
    if (password.length < 8) {
      return reply
        .status(400)
        .send({ error: "Password must be at least 8 characters" });
    }
    if (
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      return reply
        .status(400)
        .send({
          error: "Password must contain uppercase, lowercase, and a number",
        });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing) {
      return reply.status(409).send({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(users)
      .values({ email: normalizedEmail, passwordHash, name: name ?? null })
      .returning({ id: users.id, email: users.email, role: users.role });

    const token = signToken({ userId: user.id, email: user.email });

    return reply.status(201).send({
      token,
      user: { id: user.id, email: user.email, name, role: user.role },
    });
  });

  // ─── Login (local) ───────────────────────────────────────
  app.post<{
    Body: { email: string; password: string };
  }>("/api/auth/login", authRateLimit, async (request, reply) => {
    const { email, password } = request.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email ||
      !password
    ) {
      return reply
        .status(400)
        .send({ error: "Email and password are required" });
    }

    if (email.includes("\x00") || password.includes("\x00")) {
      return reply.status(400).send({ error: "Invalid credentials" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user || !user.passwordHash) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const token = signToken({ userId: user.id, email: user.email });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  });

  // ─── LDAP Login ──────────────────────────────────────────
  app.post<{
    Body: { username: string; password: string };
  }>("/api/auth/ldap", authRateLimit, async (request, reply) => {
    if (!env.LDAP_ENABLED) {
      return reply
        .status(404)
        .send({ error: "LDAP authentication is not enabled" });
    }

    const { username, password } = request.body;
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !username ||
      !password
    ) {
      return reply
        .status(400)
        .send({ error: "Username and password are required" });
    }

    if (
      !env.LDAP_URL ||
      !env.LDAP_BIND_DN ||
      !env.LDAP_BIND_PASSWORD ||
      !env.LDAP_SEARCH_BASE
    ) {
      return reply
        .status(500)
        .send({ error: "LDAP configuration is incomplete" });
    }

    try {
      const ldap = await import("ldapjs");
      const client = ldap.default.createClient({ url: env.LDAP_URL });

      // Bind with service account
      await new Promise<void>((resolve, reject) => {
        client.bind(env.LDAP_BIND_DN!, env.LDAP_BIND_PASSWORD!, (err: any) => {
          if (err) reject(new Error("LDAP service bind failed"));
          else resolve();
        });
      });

      // Search for user — use proper LDAP filter escaping (RFC 4515)
      const escapeLdap = (s: string) =>
        s.replace(
          /[\\*()&|!=<>~\x00/]/g,
          (c) => "\\" + c.charCodeAt(0).toString(16).padStart(2, "0"),
        );
      const searchFilter = env.LDAP_SEARCH_FILTER.replace(
        "{{username}}",
        escapeLdap(username),
      );

      const ldapUser = await new Promise<{
        dn: string;
        mail: string;
        cn: string;
      } | null>((resolve, reject) => {
        client.search(
          env.LDAP_SEARCH_BASE!,
          {
            filter: searchFilter,
            scope: "sub",
            attributes: ["dn", "mail", "cn"],
          },
          (err: any, res: any) => {
            if (err) return reject(err);
            let found: any = null;
            res.on("searchEntry", (entry: any) => {
              const attrs = entry.pojo?.attributes || entry.attributes || [];
              const obj: any = { dn: entry.objectName || entry.dn?.toString() };
              for (const attr of attrs) {
                const name = attr.type || attr.name;
                const val = Array.isArray(attr.values || attr.vals)
                  ? (attr.values || attr.vals)[0]
                  : attr.value || attr.val;
                obj[name] = val;
              }
              found = obj;
            });
            res.on("error", (err: any) => reject(err));
            res.on("end", () => resolve(found));
          },
        );
      });

      if (!ldapUser) {
        client.destroy();
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Bind as user to verify password
      await new Promise<void>((resolve, reject) => {
        client.bind(ldapUser.dn, password, (err: any) => {
          if (err) reject(new Error("Invalid credentials"));
          else resolve();
        });
      });

      client.destroy();

      const email = ldapUser.mail || `${username}@ldap.local`;
      const name = ldapUser.cn || username;

      // Find or create user by email
      let [user] = await db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        [user] = await db
          .insert(users)
          .values({ email, name })
          .returning({ id: users.id, email: users.email, role: users.role });
      }

      const token = signToken({ userId: user.id, email: user.email });
      return {
        token,
        user: { id: user.id, email: user.email, name, role: user.role },
      };
    } catch (err: any) {
      if (err.message === "Invalid credentials") {
        return reply.status(401).send({ error: "Invalid credentials" });
      }
      request.log.error(err, "LDAP authentication error");
      return reply.status(500).send({ error: "LDAP authentication failed" });
    }
  });

  // ─── OAuth2 PKCE: Get authorize URL ──────────────────────
  app.get("/api/auth/oauth2/authorize", async (request, reply) => {
    if (!env.OAUTH2_ENABLED) {
      return reply.status(404).send({ error: "OAuth2 is not enabled" });
    }

    if (
      !env.OAUTH2_ISSUER_URL ||
      !env.OAUTH2_CLIENT_ID ||
      !env.OAUTH2_REDIRECT_URI
    ) {
      return reply
        .status(500)
        .send({ error: "OAuth2 configuration is incomplete" });
    }

    const oidcRes = await fetch(
      `${env.OAUTH2_ISSUER_URL}/.well-known/openid-configuration`,
    );
    if (!oidcRes.ok) {
      return reply
        .status(502)
        .send({ error: "Failed to fetch OIDC configuration" });
    }
    const oidc = (await oidcRes.json()) as { authorization_endpoint: string };

    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    const state = crypto.randomBytes(16).toString("hex");

    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.OAUTH2_CLIENT_ID,
      redirect_uri: env.OAUTH2_REDIRECT_URI,
      scope: env.OAUTH2_SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return {
      authorizeUrl: `${oidc.authorization_endpoint}?${params.toString()}`,
      codeVerifier,
      state,
    };
  });

  // ─── OAuth2 PKCE: Token exchange ─────────────────────────
  app.post<{
    Body: { code: string; codeVerifier: string };
  }>("/api/auth/oauth2/callback", async (request, reply) => {
    if (!env.OAUTH2_ENABLED) {
      return reply.status(404).send({ error: "OAuth2 is not enabled" });
    }

    const { code, codeVerifier } = request.body;
    if (!code || !codeVerifier) {
      return reply
        .status(400)
        .send({ error: "code and codeVerifier are required" });
    }

    const oidcRes = await fetch(
      `${env.OAUTH2_ISSUER_URL}/.well-known/openid-configuration`,
    );
    if (!oidcRes.ok) {
      return reply
        .status(502)
        .send({ error: "Failed to fetch OIDC configuration" });
    }
    const oidc = (await oidcRes.json()) as {
      token_endpoint: string;
      userinfo_endpoint?: string;
    };

    // Exchange code for tokens
    const tokenRes = await fetch(oidc.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: env.OAUTH2_CLIENT_ID!,
        redirect_uri: env.OAUTH2_REDIRECT_URI!,
        code,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text();
      request.log.error(
        { status: tokenRes.status, body: errorBody },
        "OAuth2 token exchange failed",
      );
      return reply.status(401).send({ error: "OAuth2 token exchange failed" });
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      id_token?: string;
    };

    // Extract user info from ID token or userinfo endpoint
    let email = "";
    let name = "";

    if (tokens.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokens.id_token.split(".")[1], "base64url").toString(),
        );
        email = payload.email || "";
        name = payload.name || "";
      } catch {
        // Fall through to userinfo endpoint
      }
    }

    if (!email && oidc.userinfo_endpoint) {
      const userinfoRes = await fetch(oidc.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userinfoRes.ok) {
        const info = (await userinfoRes.json()) as {
          email?: string;
          name?: string;
        };
        email = info.email || email;
        name = info.name || name;
      }
    }

    if (!email) {
      return reply
        .status(401)
        .send({ error: "Could not determine user email" });
    }

    // Find or create user by email
    let [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      [user] = await db
        .insert(users)
        .values({ email, name: name || null })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
        });
    }

    const token = signToken({ userId: user.id, email: user.email });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  });

  // ─── Get current user ──────────────────────────────────────
  app.get(
    "/api/auth/me",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, request.user!.userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return user;
    },
  );

  // ─── Change own password ──────────────────────────────────
  app.put<{
    Body: { currentPassword: string; newPassword: string };
  }>(
    "/api/auth/change-password",
    { preHandler: [authGuard] },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body;

      if (!currentPassword || !newPassword) {
        return reply
          .status(400)
          .send({ error: "Current password and new password are required" });
      }

      if (newPassword.length < 6) {
        return reply
          .status(400)
          .send({ error: "New password must be at least 6 characters" });
      }

      const [user] = await db
        .select({ id: users.id, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, request.user!.userId))
        .limit(1);

      if (!user || !user.passwordHash) {
        return reply
          .status(400)
          .send({ error: "Password change not available for this account" });
      }

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return reply
          .status(401)
          .send({ error: "Current password is incorrect" });
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);

      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      return { success: true };
    },
  );

  // ─── Auth providers info (system config) ─────────────────
  app.get("/api/auth/providers", async () => {
    return {
      local: true,
      ldap: env.LDAP_ENABLED,
      oauth2: env.OAUTH2_ENABLED,
    };
  });
}
