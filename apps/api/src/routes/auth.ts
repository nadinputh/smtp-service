import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { getEnv, systemEmailFrom } from "@mailpocket/env";
import { getDb, users, passwordResets, apiKeys } from "@mailpocket/db";
import { eq, and, isNull, gt } from "drizzle-orm";
import { createStorage } from "@mailpocket/storage";
import { createOutboundQueue, createRedisConnection } from "@mailpocket/queue";
import { signToken, authGuard } from "../middleware/auth.js";
import { passwordPolicyError } from "../lib/password-policy.js";
import { getOrCreateSystemInbox } from "../lib/system-inbox.js";
import { sendSystemEmail } from "../lib/send-system-email.js";
import { isLdapConfigured } from "../lib/ldap-config.js";
import { normalizeEmail } from "../lib/address.js";
import { cleanString } from "../lib/validate.js";

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
// Compared against when the account doesn't exist, so login takes the same
// time whether or not an email is registered.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-password", 12);

/** Reset tokens are stored hashed so a DB leak can't be used to reset accounts. */
const hashResetToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const LDAP_CONNECT_TIMEOUT_MS = 5000;
const LDAP_OPERATION_TIMEOUT_MS = 10000;

export function registerAuthRoutes(app: FastifyInstance) {
  const env = getEnv();
  const db = getDb(env.DATABASE_URL);

  if (env.LDAP_ENABLED && !isLdapConfigured(env)) {
    app.log.warn(
      "LDAP_ENABLED is true but LDAP_URL, LDAP_BIND_DN, LDAP_BIND_PASSWORD, or LDAP_SEARCH_BASE is missing — LDAP login will report a configuration error to every user who tries it",
    );
  }
  if (
    env.LDAP_ENABLED &&
    env.LDAP_URL &&
    !env.LDAP_URL.startsWith("ldaps://")
  ) {
    app.log.warn(
      { url: env.LDAP_URL },
      "LDAP_URL is not using ldaps:// — service and user credentials will be sent to the directory server unencrypted",
    );
  }

  const storage = createStorage(
    env.STORAGE_DRIVER === "local"
      ? {
          driver: "local",
          basePath: env.STORAGE_LOCAL_PATH,
          bucket: env.MINIO_BUCKET,
        }
      : {
          driver: "s3",
          endPoint: env.MINIO_ENDPOINT,
          port: env.MINIO_PORT,
          accessKey: env.MINIO_ACCESS_KEY!,
          secretKey: env.MINIO_SECRET_KEY!,
          useSSL: env.MINIO_USE_SSL,
          bucket: env.MINIO_BUCKET,
        },
  );
  const outboundQueue = createOutboundQueue(
    createRedisConnection({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    }),
  );

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
    const { email, password, name } = request.body ?? {};

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

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || normalizedEmail.length > 255) {
      return reply
        .status(400)
        .send({ error: "A valid email address is required" });
    }
    if (
      name !== undefined &&
      name !== null &&
      (typeof name !== "string" || name.trim().length > 255)
    ) {
      return reply
        .status(400)
        .send({ error: "name must be a string of at most 255 characters" });
    }
    const cleanName = cleanString(name, 255);

    // Password strength validation
    const passwordError = passwordPolicyError(password);
    if (passwordError) {
      return reply.status(400).send({ error: passwordError });
    }

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
      .values({ email: normalizedEmail, passwordHash, name: cleanName })
      .returning({ id: users.id, email: users.email, role: users.role });

    const token = signToken({ userId: user.id, email: user.email });

    return reply.status(201).send({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: cleanName,
        role: user.role,
      },
    });
  });

  // ─── Login (local) ───────────────────────────────────────
  app.post<{
    Body: { email: string; password: string };
  }>("/api/auth/login", authRateLimit, async (request, reply) => {
    const { email, password } = request.body ?? {};

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

    // Always run a bcrypt compare so timing doesn't reveal whether the
    // account exists.
    const valid = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !user.passwordHash || !valid) {
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

    const { username, password } = request.body ?? {};
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

    if (!isLdapConfigured(env)) {
      request.log.error(
        "LDAP login attempted but LDAP_URL, LDAP_BIND_DN, LDAP_BIND_PASSWORD, or LDAP_SEARCH_BASE is missing",
      );
      return reply
        .status(500)
        .send({ error: "LDAP configuration is incomplete" });
    }

    const ldap = await import("ldapjs");
    const client = ldap.default.createClient({
      url: env.LDAP_URL!,
      connectTimeout: LDAP_CONNECT_TIMEOUT_MS,
      timeout: LDAP_OPERATION_TIMEOUT_MS,
    });

    try {
      // Bind with service account
      await new Promise<void>((resolve, reject) => {
        client.bind(env.LDAP_BIND_DN!, env.LDAP_BIND_PASSWORD!, (err: any) => {
          if (err) reject(new Error("LDAP service bind failed"));
          else resolve();
        });
      });
      request.log.info(
        { url: env.LDAP_URL },
        "Connected to LDAP server successfully",
      );

      // Search for user — use proper LDAP filter escaping (RFC 4515)
      const escapeLdap = (s: string) =>
        s.replace(
          /[\\*()&|!=<>~\x00/]/g,
          (c) => "\\" + c.charCodeAt(0).toString(16).padStart(2, "0"),
        );
      // replaceAll, not replace: a filter that offers multiple login
      // formats (e.g. "(|(sAMAccountName={{username}})(userPrincipalName=
      // {{username}}))") repeats the placeholder — a single replace() only
      // fills in the first one and silently breaks every OR branch after it.
      const searchFilter = env.LDAP_SEARCH_FILTER.replaceAll(
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
            const matches: any[] = [];
            res.on("searchEntry", (entry: any) => {
              const attrs = entry.pojo?.attributes || entry.attributes || [];
              const obj: any = {
                dn:
                  entry.pojo?.objectName ??
                  entry.objectName?.toString() ??
                  entry.dn?.toString(),
              };
              for (const attr of attrs) {
                const name = attr.type || attr.name;
                const val = Array.isArray(attr.values || attr.vals)
                  ? (attr.values || attr.vals)[0]
                  : attr.value || attr.val;
                obj[name] = val;
              }
              matches.push(obj);
            });
            res.on("error", (err: any) => reject(err));
            res.on("end", () => {
              if (matches.length > 1) {
                request.log.error(
                  { filter: searchFilter, count: matches.length },
                  "LDAP search matched more than one entry for a single username — refusing to guess",
                );
                return reject(new Error("Ambiguous LDAP match"));
              }
              resolve(matches[0] ?? null);
            });
          },
        );
      });

      if (!ldapUser) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      // Bind as user to verify password
      await new Promise<void>((resolve, reject) => {
        client.bind(ldapUser.dn, password, (err: any) => {
          if (err) reject(new Error("Invalid credentials"));
          else resolve();
        });
      });

      const email = (ldapUser.mail || `${username}@ldap.local`)
        .trim()
        .toLowerCase();
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
    } finally {
      client.destroy();
    }
  });

  // ─── OAuth2 PKCE: Get authorize URL ──────────────────────
  // The client generates codeVerifier and sends only codeChallenge here.
  // This keeps the verifier exclusively on the client, preserving PKCE security.
  app.get<{ Querystring: { codeChallenge: string } }>(
    "/api/auth/oauth2/authorize",
    async (request, reply) => {
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

      const { codeChallenge } = request.query;
      if (!codeChallenge || typeof codeChallenge !== "string") {
        return reply.status(400).send({ error: "codeChallenge is required" });
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
        state,
      };
    },
  );

  // ─── OAuth2 PKCE: Token exchange ─────────────────────────
  app.post<{
    Body: { code: string; codeVerifier: string };
  }>("/api/auth/oauth2/callback", async (request, reply) => {
    if (!env.OAUTH2_ENABLED) {
      return reply.status(404).send({ error: "OAuth2 is not enabled" });
    }

    const { code, codeVerifier } = request.body ?? {};
    if (
      typeof code !== "string" ||
      typeof codeVerifier !== "string" ||
      !code ||
      !codeVerifier
    ) {
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
        // Only trust an email the provider has verified.
        if (payload.email_verified !== false) email = payload.email || "";
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
          email_verified?: boolean;
          name?: string;
        };
        if (info.email_verified !== false) email = info.email || email;
        name = info.name || name;
      }
    }

    email = typeof email === "string" ? email.trim().toLowerCase() : "";
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
      const { currentPassword, newPassword } = request.body ?? {};

      if (
        typeof currentPassword !== "string" ||
        typeof newPassword !== "string" ||
        !currentPassword ||
        !newPassword
      ) {
        return reply
          .status(400)
          .send({ error: "Current password and new password are required" });
      }

      const newPasswordError = passwordPolicyError(newPassword);
      if (newPasswordError) {
        return reply.status(400).send({ error: newPasswordError });
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
        .set({
          passwordHash,
          passwordChangedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
      // A key may be what leaked: like sessions, they end with the password.
      await db.delete(apiKeys).where(eq(apiKeys.userId, user.id));

      // Other sessions are now invalid; hand this one a fresh token so the
      // user isn't logged out of the device they just changed it on.
      return {
        success: true,
        token: signToken({ userId: user.id, email: request.user!.email }),
      };
    },
  );

  // ─── Forgot password ────────────────────────────────────
  app.post<{
    Body: { email: string };
  }>("/api/auth/forgot-password", authRateLimit, async (request, reply) => {
    const email = request.body?.email;
    if (typeof email !== "string" || !email) {
      return reply.status(400).send({ error: "Email is required" });
    }

    // Always the same response whether or not the account exists —
    // don't let this endpoint be used to enumerate registered emails.
    const genericResponse = {
      message:
        "If an account exists for that email, we've sent a password reset link.",
    };

    const normalizedEmail = email.trim().toLowerCase();
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!user) {
      return genericResponse;
    }

    const token = crypto.randomBytes(32).toString("hex");
    await db.insert(passwordResets).values({
      userId: user.id,
      token: hashResetToken(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });

    const resetUrl = `${env.WEB_APP_URL}/reset-password?token=${token}`;

    try {
      const systemInbox = await getOrCreateSystemInbox(db);
      await sendSystemEmail({
        db,
        storage,
        outboundQueue,
        systemInboxId: systemInbox.id,
        from: systemEmailFrom(env),
        to: user.email,
        subject: "Reset your MailPocket password",
        text: `We got a request to reset your MailPocket password. This link expires in 1 hour:\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
        html: `<p>We got a request to reset your MailPocket password. This link expires in 1 hour:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
      });
    } catch (err) {
      // Delivery failure shouldn't leak account existence or block the
      // generic response — log server-side for operators to investigate.
      app.log.error(
        { err, userId: user.id },
        "Failed to send password reset email",
      );
    }

    return genericResponse;
  });

  // ─── Reset password ─────────────────────────────────────
  app.post<{
    Body: { token: string; newPassword: string };
  }>("/api/auth/reset-password", authRateLimit, async (request, reply) => {
    const { token, newPassword } = request.body ?? {};
    if (
      typeof token !== "string" ||
      typeof newPassword !== "string" ||
      !token ||
      !newPassword
    ) {
      return reply
        .status(400)
        .send({ error: "Token and new password are required" });
    }

    const newPasswordError = passwordPolicyError(newPassword);
    if (newPasswordError) {
      return reply.status(400).send({ error: newPasswordError });
    }

    // Claim the token atomically so a concurrent second use can't also succeed.
    const [reset] = await db
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResets.token, hashResetToken(token)),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, new Date()),
        ),
      )
      .returning({ userId: passwordResets.userId });

    if (!reset) {
      return reply
        .status(400)
        .send({ error: "This reset link is invalid or has expired" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db
      .update(users)
      .set({
        passwordHash,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, reset.userId));
    await db.delete(apiKeys).where(eq(apiKeys.userId, reset.userId));

    // Any other outstanding reset links for this account are now void.
    await db
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResets.userId, reset.userId),
          isNull(passwordResets.usedAt),
        ),
      );

    return { success: true };
  });

  // ─── Auth providers info (system config) ─────────────────
  app.get("/api/auth/providers", async () => {
    return {
      local: true,
      ldap: isLdapConfigured(env),
      oauth2: env.OAUTH2_ENABLED,
    };
  });
}
