import { describe, it, expect, beforeAll, afterAll } from "vitest";

const API_BASE = process.env.API_BASE ?? "http://localhost:3001";
let token: string;

// Helper for API calls
async function api(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = {
    ...((opts.headers as Record<string, string>) ?? {}),
  };
  if (opts.body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
}

describe("API Integration Tests", () => {
  const testEmail = `test-${Date.now()}@integration.test`;
  const testPassword = "IntegrationTest123!";

  /** Give a describe block its own account so shared-user quotas (10 inboxes) aren't exhausted. */
  function withFreshUser(tag: string) {
    let saved: string;
    beforeAll(async () => {
      saved = token;
      const { body } = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${tag}-${Date.now()}@integration.test`,
          password: "IntegrationTest123!",
        }),
      });
      token = body.token;
    });
    afterAll(() => {
      token = saved;
    });
  }

  describe("Health", () => {
    it("GET /health returns ok", async () => {
      const { status, body } = await api("/health");
      expect(status).toBe(200);
      expect(body.status).toBe("ok");
    });
  });

  describe("Auth", () => {
    it("POST /api/auth/register creates a new user", async () => {
      const { status, body } = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });
      expect(status).toBe(201);
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe(testEmail);
      token = body.token;
    });

    it("POST /api/auth/register rejects duplicate email", async () => {
      const { status } = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });
      expect(status).toBe(409);
    });

    it("POST /api/auth/login succeeds with correct password", async () => {
      const { status, body } = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });
      expect(status).toBe(200);
      expect(body.token).toBeDefined();
      token = body.token;
    });

    it("POST /api/auth/login fails with wrong password", async () => {
      const { status } = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: testEmail, password: "wrong" }),
      });
      expect(status).toBe(401);
    });
  });

  describe("Inboxes", () => {
    let inboxId: string;

    it("POST /api/inboxes creates an inbox", async () => {
      const { status, body } = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Test Inbox" }),
      });
      expect(status).toBe(201);
      expect(body.name).toBe("Test Inbox");
      expect(body.smtpUsername).toBeDefined();
      expect(body.smtpPassword).toBeDefined();
      inboxId = body.id;
    });

    it("GET /api/inboxes lists inboxes", async () => {
      const { status, body } = await api("/api/inboxes");
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
    });

    it("GET /api/inboxes/:id returns inbox detail", async () => {
      const { status, body } = await api(`/api/inboxes/${inboxId}`);
      expect(status).toBe(200);
      expect(body.id).toBe(inboxId);
      expect(body.smtpPassword).toBeDefined();
    });

    it("GET /api/inboxes/:id/messages returns empty list initially", async () => {
      const { status, body } = await api(`/api/inboxes/${inboxId}/messages`);
      expect(status).toBe(200);
      expect(Array.isArray(body.messages)).toBe(true);
    });

    // Webhooks (nested under inbox)
    describe("Webhooks", () => {
      let webhookId: string;

      it("POST /api/inboxes/:id/webhooks creates a webhook", async () => {
        const { status, body } = await api(`/api/inboxes/${inboxId}/webhooks`, {
          method: "POST",
          body: JSON.stringify({
            url: "https://example.com/webhook",
            onDelivered: true,
            onBounced: true,
            onOpened: false,
          }),
        });
        expect(status).toBe(201);
        expect(body.url).toBe("https://example.com/webhook");
        webhookId = body.id;
      });

      it("GET /api/inboxes/:id/webhooks lists webhooks", async () => {
        const { status, body } = await api(`/api/inboxes/${inboxId}/webhooks`);
        expect(status).toBe(200);
        expect(body.length).toBe(1);
      });

      it("DELETE /api/inboxes/:id/webhooks/:whId deletes webhook", async () => {
        const { status, body } = await api(
          `/api/inboxes/${inboxId}/webhooks/${webhookId}`,
          { method: "DELETE" },
        );
        expect(status).toBe(200);
        expect(body.success).toBe(true);
      });
    });

    it("DELETE /api/inboxes/:id deletes inbox", async () => {
      const { status, body } = await api(`/api/inboxes/${inboxId}`, {
        method: "DELETE",
      });
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe("Domains", () => {
    let domainId: string;

    it("POST /api/domains creates a domain with DKIM keys", async () => {
      const { status, body } = await api("/api/domains", {
        method: "POST",
        body: JSON.stringify({ domain: `test-${Date.now()}.example.com` }),
      });
      expect(status).toBe(201);
      expect(body.dkimPublicKey).toBeDefined();
      expect(body.dnsRecords.dkim).toBeDefined();
      domainId = body.id;
    });

    it("GET /api/domains lists domains", async () => {
      const { status, body } = await api("/api/domains");
      expect(status).toBe(200);
      expect(body.length).toBeGreaterThanOrEqual(1);
    });

    it("POST /api/domains/:id/verify reports unverified when no DNS record is published", async () => {
      const { status, body } = await api(`/api/domains/${domainId}/verify`, {
        method: "POST",
      });
      expect(status).toBe(200);
      expect(body.verified).toBe(false);
      expect(body.errors.length).toBeGreaterThanOrEqual(1);
    });

    it("POST /api/domains/:id/verify 404s for an unknown domain id", async () => {
      const { status } = await api(
        "/api/domains/00000000-0000-0000-0000-000000000000/verify",
        { method: "POST" },
      );
      expect(status).toBe(404);
    });

    it.each(["a..b.com", "-a.com", "localhost", "", 42])(
      "POST /api/domains rejects invalid domain %j",
      async (domain) => {
        const { status } = await api("/api/domains", {
          method: "POST",
          body: JSON.stringify({ domain }),
        });
        expect(status).toBe(400);
      },
    );

    it("POST /api/domains rejects a duplicate regardless of case", async () => {
      const name = `dup-${Date.now()}.example.com`;
      const first = await api("/api/domains", {
        method: "POST",
        body: JSON.stringify({ domain: name }),
      });
      expect(first.status).toBe(201);
      const second = await api("/api/domains", {
        method: "POST",
        body: JSON.stringify({ domain: name.toUpperCase() }),
      });
      expect(second.status).toBe(409);
      await api(`/api/domains/${first.body.id}`, { method: "DELETE" });
    });

    it("a domain claimed by another account can still be added while unverified", async () => {
      const name = `shared-${Date.now()}.example.com`;
      const mine = await api("/api/domains", {
        method: "POST",
        body: JSON.stringify({ domain: name }),
      });
      expect(mine.status).toBe(201);

      const ownerToken = token;
      const other = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `other-${Date.now()}@integration.test`,
          password: "IntegrationTest123!",
        }),
      });
      token = other.body.token;
      try {
        const theirs = await api("/api/domains", {
          method: "POST",
          body: JSON.stringify({ domain: name }),
        });
        expect(theirs.status).toBe(201);
      } finally {
        token = ownerToken;
      }
      await api(`/api/domains/${mine.body.id}`, { method: "DELETE" });
    });

    it("verify and delete 404 on a malformed id", async () => {
      const verify = await api("/api/domains/not-a-uuid/verify", {
        method: "POST",
      });
      expect(verify.status).toBe(404);
      const del = await api("/api/domains/not-a-uuid", { method: "DELETE" });
      expect(del.status).toBe(404);
    });

    it("DELETE /api/domains/:id deletes domain", async () => {
      const { status, body } = await api(`/api/domains/${domainId}`, {
        method: "DELETE",
      });
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe("Templates validation", () => {
    it.each([
      [{ name: { a: 1 }, html: "x" }],
      [{ name: "   ", html: "x" }],
      [{ name: "n", html: ["x"] }],
      [{ name: "x".repeat(300), html: "x" }],
      [{ name: "n", html: "x", subject: "s".repeat(1100) }],
    ])("POST /api/templates rejects %j", async (payload) => {
      const { status } = await api("/api/templates", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      expect(status).toBe(400);
    });

    it("PUT cannot blank the name and malformed ids 404", async () => {
      const created = await api("/api/templates", {
        method: "POST",
        body: JSON.stringify({ name: "t", html: "<p>{{a}}</p>" }),
      });
      const blank = await api(`/api/templates/${created.body.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: "" }),
      });
      expect(blank.status).toBe(400);
      for (const method of ["GET", "PUT", "DELETE"]) {
        const r = await api("/api/templates/not-a-uuid", {
          method,
          ...(method === "PUT" ? { body: JSON.stringify({ name: "x" }) } : {}),
        });
        expect(r.status).toBe(404);
      }
      await api(`/api/templates/${created.body.id}`, { method: "DELETE" });
    });
  });

  describe("API keys", () => {
    async function makeKey(scopes: string[]) {
      const { body } = await api("/api/keys", {
        method: "POST",
        body: JSON.stringify({ name: "scope-test", scopes }),
      });
      return { id: body.id as string, raw: body.rawKey as string };
    }
    const withKey = (raw: string, path: string, init: RequestInit = {}) =>
      fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { "x-api-key": raw, "Content-Type": "application/json" },
      }).then((r) => r.status);

    it.each([
      [{ name: "k", scopes: "send" }],
      [{ name: "k", scopes: ["nope"] }],
      [{ name: "k", scopes: ["send"], expiresAt: "garbage" }],
      [{ name: "k", scopes: ["send"], expiresAt: "2001-01-01" }],
      [{ name: "k".repeat(300), scopes: ["send"] }],
    ])("POST /api/keys rejects %j", async (payload) => {
      const { status } = await api("/api/keys", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      expect(status).toBe(400);
    });

    it("enforces scopes and keeps key management session-only", async () => {
      const read = await makeKey(["read"]);
      const send = await makeKey(["send"]);
      expect(await withKey(read.raw, "/api/templates")).toBe(200);
      expect(await withKey(send.raw, "/api/templates")).toBe(403);
      expect(
        await withKey(read.raw, "/v1/messages", {
          method: "POST",
          body: "{}",
        }),
      ).toBe(403);
      expect(await withKey(read.raw, "/api/keys")).toBe(403);
      expect(
        await withKey(send.raw, "/api/keys", {
          method: "POST",
          body: JSON.stringify({ name: "x", scopes: ["send"] }),
        }),
      ).toBe(403);
      expect(
        await withKey("smtps_live_" + "0".repeat(32), "/api/templates"),
      ).toBe(401);
      for (const k of [read, send]) {
        await api(`/api/keys/${k.id}`, { method: "DELETE" });
      }
    });

    it("DELETE /api/keys/:id 404s on a malformed id", async () => {
      const { status } = await api("/api/keys/not-a-uuid", {
        method: "DELETE",
      });
      expect(status).toBe(404);
    });
  });

  describe("Analytics validation", () => {
    withFreshUser("analytics");

    it("rejects an unknown period or metric", async () => {
      expect((await api("/api/analytics/overview?period=1y")).status).toBe(400);
      expect((await api("/api/analytics/timeseries?metric=bogus")).status).toBe(
        400,
      );
      expect((await api("/api/analytics/bounce-rate?period=x")).status).toBe(
        400,
      );
    });

    it("timeseries window ends today and includes today's messages", async () => {
      const inbox = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Analytics Inbox" }),
      });
      await api("/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          inboxId: inbox.body.id,
          from: "test@example.com",
          to: ["today@example.com"],
          subject: "today",
          text: "hi",
        }),
      });
      const { body } = await api("/api/analytics/timeseries?period=7d");
      expect(body.labels).toHaveLength(7);
      expect(body.labels.at(-1)).toBe(new Date().toISOString().slice(0, 10));
      expect(body.values.at(-1)).toBeGreaterThanOrEqual(1);
    });

    it("overview has the full shape for a user with no inboxes", async () => {
      const ownerToken = token;
      const other = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `empty-${Date.now()}@integration.test`,
          password: "IntegrationTest123!",
        }),
      });
      token = other.body.token;
      try {
        const { status, body } = await api("/api/analytics/overview");
        expect(status).toBe(200);
        expect(body.period).toMatchObject({ days: 30, total: 0 });
        expect(body.totalMessages).toBe(0);
      } finally {
        token = ownerToken;
      }
    });
  });

  describe("Teams hardening", () => {
    async function registerUser(tag: string) {
      const { body } = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${tag}-${Date.now()}@integration.test`,
          password: "IntegrationTest123!",
        }),
      });
      return { token: body.token as string, id: body.user.id as string };
    }
    async function as<T>(t: string, fn: () => Promise<T>) {
      const prev = token;
      token = t;
      try {
        return await fn();
      } finally {
        token = prev;
      }
    }

    it("validates input, protects the owner, and limits deletion", async () => {
      const teamAdmin = await registerUser("team-admin");
      const outsider = await registerUser("outsider");
      const team = await api("/api/teams", {
        method: "POST",
        body: JSON.stringify({ name: "Hardening" }),
      });
      const teamId = team.body.id as string;

      expect(
        (
          await api("/api/teams", {
            method: "POST",
            body: JSON.stringify({ name: { a: 1 } }),
          })
        ).status,
      ).toBe(400);
      expect((await api("/api/teams/not-a-uuid")).status).toBe(404);

      const badRole = await api(`/api/teams/${teamId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: teamAdmin.id, role: "root" }),
      });
      expect(badRole.status).toBe(400);
      const added = await api(`/api/teams/${teamId}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: teamAdmin.id, role: "admin" }),
      });
      expect(added.status).toBe(201);

      // A missing role must not silently demote.
      const noRole = await api(`/api/teams/${teamId}/members/${teamAdmin.id}`, {
        method: "PUT",
        body: JSON.stringify({}),
      });
      expect(noRole.status).toBe(400);

      // Team admins can't touch the owner's membership or delete the team.
      const ownerId = team.body.ownerId as string;
      await as(teamAdmin.token, async () => {
        expect(
          (
            await api(`/api/teams/${teamId}/members/${ownerId}`, {
              method: "DELETE",
            })
          ).status,
        ).toBe(400);
        expect(
          (await api(`/api/teams/${teamId}`, { method: "DELETE" })).status,
        ).toBe(403);
      });

      // Only team managers may search the user directory.
      await as(outsider.token, async () => {
        expect((await api("/api/users/search?q=integration")).status).toBe(403);
      });

      const invite = await api(`/api/teams/${teamId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email: "not-an-email" }),
      });
      expect(invite.status).toBe(400);
      expect((await api(`/api/teams/${teamId}/activity?limit=-5`)).status).toBe(
        200,
      );

      expect(
        (await api(`/api/teams/${teamId}`, { method: "DELETE" })).status,
      ).toBe(204);
    });
  });

  describe("Inbox hardening", () => {
    withFreshUser("inbox-hard");

    async function registerUser(tag: string) {
      const { body } = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: `${tag}-${Date.now()}@integration.test`,
          password: "IntegrationTest123!",
        }),
      });
      return { token: body.token as string, email: body.user.email as string };
    }
    async function as<T>(t: string, fn: () => Promise<T>) {
      const prev = token;
      token = t;
      try {
        return await fn();
      } finally {
        token = prev;
      }
    }

    it("rejects bad input and foreign teams", async () => {
      const other = await registerUser("team-owner");
      const foreignTeam = await as(other.token, () =>
        api("/api/teams", {
          method: "POST",
          body: JSON.stringify({ name: "Foreign" }),
        }),
      );

      for (const payload of [
        { name: { a: 1 } },
        { name: "x".repeat(300) },
        { name: "ok", teamId: "not-a-uuid" },
      ]) {
        const r = await api("/api/inboxes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        expect(r.status).toBe(400);
      }

      // Can't attach an inbox to a team the user doesn't belong to.
      const foreign = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "x", teamId: foreignTeam.body.id }),
      });
      expect(foreign.status).toBe(404);

      const mine = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Mine" }),
      });
      const moved = await api(`/api/inboxes/${mine.body.id}`, {
        method: "PUT",
        body: JSON.stringify({ teamId: foreignTeam.body.id }),
      });
      expect(moved.status).toBe(404);
      const blank = await api(`/api/inboxes/${mine.body.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: "" }),
      });
      expect(blank.status).toBe(400);
    });

    it("looks members up case-insensitively and hides the SMTP password from viewers", async () => {
      const viewer = await registerUser("viewer");
      const inbox = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Shared" }),
      });
      const id = inbox.body.id as string;

      const added = await api(`/api/inboxes/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ email: viewer.email.toUpperCase() }),
      });
      expect(added.status).toBe(200);
      const bad = await api(`/api/inboxes/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ email: "nope" }),
      });
      expect(bad.status).toBe(400);
      expect(
        (
          await api(`/api/inboxes/${id}/members/not-a-uuid`, {
            method: "DELETE",
          })
        ).status,
      ).toBe(404);

      const asViewer = await as(viewer.token, () => api(`/api/inboxes/${id}`));
      expect(asViewer.status).toBe(200);
      expect(asViewer.body.smtpPassword).toBeUndefined();
      const asOwner = await api(`/api/inboxes/${id}`);
      expect(asOwner.body.smtpPassword).toBeDefined();
    });
  });

  describe("Auth hardening", () => {
    const pw = "IntegrationTest123!";

    it.each([
      [{ email: "nope", password: pw }],
      [
        {
          email: `x-${Date.now()}@integration.test`,
          password: pw,
          name: { a: 1 },
        },
      ],
      [{ email: { a: 1 }, password: pw }],
    ])("POST /api/auth/register rejects %j", async (payload) => {
      const { status } = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      expect(status).toBe(400);
    });

    it("changing the password ends other sessions but keeps the fresh token valid", async () => {
      const email = `session-${Date.now()}@integration.test`;
      const reg = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password: pw }),
      });
      const oldToken = reg.body.token as string;
      const asToken = <T>(t: string, fn: () => Promise<T>) => {
        const prev = token;
        token = t;
        return fn().finally(() => {
          token = prev;
        });
      };

      // JWT iat has 1s resolution; make sure the change lands in a later second.
      await new Promise((r) => setTimeout(r, 1100));
      const changed = await asToken(oldToken, () =>
        api("/api/auth/change-password", {
          method: "PUT",
          body: JSON.stringify({
            currentPassword: pw,
            newPassword: "ChangedPassw0rd!",
          }),
        }),
      );
      expect(changed.status).toBe(200);
      expect(changed.body.token).toBeDefined();

      expect((await asToken(oldToken, () => api("/api/auth/me"))).status).toBe(
        401,
      );
      expect(
        (await asToken(changed.body.token, () => api("/api/auth/me"))).status,
      ).toBe(200);
    });

    it("login is case-insensitive on email and rejects malformed bodies", async () => {
      const email = `Case-${Date.now()}@integration.test`;
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password: pw }),
      });
      const ok = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.toUpperCase(), password: pw }),
      });
      expect(ok.status).toBe(200);
      const bad = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: { a: 1 }, password: pw }),
      });
      expect(bad.status).toBe(400);
    });
  });

  describe("Webhooks isolation", () => {
    withFreshUser("hooks");

    it("validates urls and won't expose or retry another inbox's webhook", async () => {
      const a = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Hook A" }),
      });
      const b = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Hook B" }),
      });

      for (const url of ["ftp://example.com", "https://u:p@example.com", 5]) {
        const bad = await api(`/api/inboxes/${a.body.id}/webhooks`, {
          method: "POST",
          body: JSON.stringify({ url }),
        });
        expect(bad.status).toBe(400);
      }
      const flags = await api(`/api/inboxes/${a.body.id}/webhooks`, {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/h", onOpened: "yes" }),
      });
      expect(flags.status).toBe(400);

      const hook = await api(`/api/inboxes/${a.body.id}/webhooks`, {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/h" }),
      });
      expect(hook.status).toBe(201);

      // Same webhook id via a different inbox must not resolve.
      const logs = await api(
        `/api/inboxes/${b.body.id}/webhooks/${hook.body.id}/logs`,
      );
      expect(logs.status).toBe(404);
      const retry = await api(
        `/api/inboxes/${b.body.id}/webhooks/${hook.body.id}/logs/${hook.body.id}/retry`,
        { method: "POST" },
      );
      expect(retry.status).toBe(404);
      expect(
        (
          await api(`/api/inboxes/${a.body.id}/webhooks/not-a-uuid`, {
            method: "DELETE",
          })
        ).status,
      ).toBe(404);
    });
  });

  describe("Message list and bulk read", () => {
    withFreshUser("msglist");

    it("bulk mark-read validates input and accepts valid ids", async () => {
      const inbox = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Bulk Read" }),
      });
      const path = `/api/inboxes/${inbox.body.id}/messages/read`;
      const unknownId = "00000000-0000-4000-8000-000000000000";
      const put = (body: unknown) =>
        api(path, { method: "PUT", body: JSON.stringify(body) });

      expect((await put({ messageIds: ["nope"], isRead: true })).status).toBe(
        400,
      );
      expect(
        (await put({ messageIds: [unknownId], isRead: "yes" })).status,
      ).toBe(400);
      expect((await put({ messageIds: [], isRead: true })).status).toBe(400);
      expect(
        (await put({ messageIds: [unknownId], isRead: true })).status,
      ).toBe(200);
    });

    it("list tolerates junk pagination and rejects a malformed ruleId", async () => {
      const inbox = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "List Junk" }),
      });
      const base = `/api/inboxes/${inbox.body.id}/messages`;
      expect(
        (await api(`${base}?page=99999999999&limit=-3&q=%25&from=_`)).status,
      ).toBe(200);
      expect((await api(`${base}?ruleId=nope`)).status).toBe(400);
    });
  });

  describe("Click tracking redirect safety", () => {
    it("does not redirect unsigned links; shows a confirmation page instead", async () => {
      const res = await fetch(
        `${API_BASE}/t/click/11111111-1111-4111-8111-111111111111?url=${encodeURIComponent("https://evil.example/login")}`,
        { redirect: "manual" },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(res.headers.get("location")).toBeNull();
      expect(await res.text()).toContain("https://evil.example/login");
    });

    it("escapes the destination in the confirmation page", async () => {
      const res = await fetch(
        `${API_BASE}/t/click/x?url=${encodeURIComponent('https://e.example/"><script>alert(1)</script>')}`,
        { redirect: "manual" },
      );
      expect(await res.text()).not.toContain("<script>");
    });
  });

  describe("Inbox rules validation", () => {
    withFreshUser("rules");

    it("rejects unknown colors, blank names, and malformed ids", async () => {
      const inbox = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Rules Validation" }),
      });
      const base = `/api/inboxes/${inbox.body.id}/rules`;
      const conditions = [{ field: "from", op: "contains", value: "a" }];
      const post = (body: unknown) =>
        api(base, { method: "POST", body: JSON.stringify(body) });

      expect((await post({ name: "  ", conditions })).status).toBe(400);
      expect((await post({ name: { a: 1 }, conditions })).status).toBe(400);
      expect(
        (await post({ name: "r", color: "javascript:x", conditions })).status,
      ).toBe(400);
      expect(
        (await post({ name: "ok", color: "blue", conditions })).status,
      ).toBe(200);
      expect(
        (await api(`${base}/not-a-uuid`, { method: "DELETE" })).status,
      ).toBe(404);
    });
  });

  describe("Export hardening", () => {
    withFreshUser("export");

    it("neutralizes hostile inbox names and rejects bad params", async () => {
      const inbox = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: 'Evil"\r\nx' }),
      });
      // Node refuses CR/LF in headers, so a naive name would 500 here.
      const ok = await fetch(
        `${API_BASE}/api/inboxes/${inbox.body.id}/export?format=csv`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      expect(ok.status).toBe(200);
      expect(ok.headers.get("content-disposition")).not.toMatch(/[\r\n]/);

      const base = `/api/inboxes/${inbox.body.id}/export`;
      expect((await api(`${base}?format=pdf`)).status).toBe(400);
      expect((await api(`${base}?format=csv&ruleId=nope`)).status).toBe(400);
    });
  });

  describe("Send quota and cc/bcc", () => {
    withFreshUser("quota");

    it("counts cc/bcc and mime/batch sends against the monthly quota", async () => {
      const inbox = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Quota" }),
      });
      const before = (await api("/api/account/usage")).body.currentMonthlySent;

      const json = await api("/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          inboxId: inbox.body.id,
          from: "q@example.com",
          to: ["to@example.com"],
          cc: ["cc@example.com"],
          bcc: ["bcc@example.com"],
          subject: "quota",
          text: "hi",
        }),
      });
      expect(json.status).toBe(202);

      const batch = await api("/v1/messages/batch", {
        method: "POST",
        body: JSON.stringify({
          inboxId: inbox.body.id,
          from: "q@example.com",
          subject: "quota",
          text: "hi",
          recipients: [{ to: "b1@example.com" }, { to: "b2@example.com" }],
        }),
      });
      expect(batch.status).toBe(202);

      const used = (await api("/api/account/usage")).body.currentMonthlySent;
      expect(used - before).toBe(3 + 2);
    });

    it("rejects a send that would exceed the monthly limit", async () => {
      const inbox = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Quota Over" }),
      });
      const tooMany = Array.from({ length: 1001 }, (_, i) => `u${i}@example.com`);
      const r = await api("/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          inboxId: inbox.body.id,
          from: "q@example.com",
          to: tooMany,
          subject: "quota",
          text: "hi",
        }),
      });
      expect(r.status).toBe(429);
    });
  });

  describe("Tracking Endpoints", () => {
    it("GET /t/open/:messageId returns tracking pixel", async () => {
      const res = await fetch(`${API_BASE}/t/open/fake-message-id`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/gif");
    });

    it("GET /t/click/:messageId with an unsigned url confirms instead of redirecting", async () => {
      const res = await fetch(
        `${API_BASE}/t/click/fake-message-id?url=${encodeURIComponent("https://example.com")}`,
        { redirect: "manual" },
      );
      // Signed links (see packages/queue tracking-signature tests) redirect;
      // unsigned ones must not act as an open redirect.
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(await res.text()).toContain("example.com");
    });

    it("GET /t/click rejects missing url parameter", async () => {
      const res = await fetch(`${API_BASE}/t/click/fake-message-id`);
      expect(res.status).toBe(400);
    });
  });

  describe("Auth Guards", () => {
    it("GET /api/inboxes rejects unauthenticated requests", async () => {
      const saved = token;
      token = "";
      const { status } = await api("/api/inboxes");
      expect(status).toBe(401);
      token = saved;
    });
  });

  // ─── API Keys ───────────────────────────────────────────
  describe("API Keys", () => {
    let keyId: string;
    let rawKey: string;

    it("POST /api/keys creates an API key", async () => {
      const { status, body } = await api("/api/keys", {
        method: "POST",
        body: JSON.stringify({
          name: "Integration Test Key",
          scopes: ["read", "send"],
        }),
      });
      expect(status).toBe(201);
      expect(body.name).toBe("Integration Test Key");
      expect(body.rawKey).toBeDefined();
      expect(body.rawKey).toMatch(/^smtps_/);
      keyId = body.id;
      rawKey = body.rawKey;
    });

    it("POST /api/keys rejects missing scopes", async () => {
      const { status } = await api("/api/keys", {
        method: "POST",
        body: JSON.stringify({ name: "Bad Key", scopes: [] }),
      });
      expect(status).toBe(400);
    });

    it("GET /api/keys lists keys without raw secret", async () => {
      const { status, body } = await api("/api/keys");
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      const key = body.find((k: any) => k.id === keyId);
      expect(key).toBeDefined();
      expect(key.name).toBe("Integration Test Key");
      expect(key.rawKey).toBeUndefined();
      expect(key.prefix).toBeDefined();
    });

    it("API key authenticates successfully for read scope", async () => {
      const saved = token;
      token = "";
      const res = await fetch(`${API_BASE}/api/inboxes`, {
        headers: { Authorization: `Bearer ${rawKey}` },
      });
      expect(res.status).toBe(200);
      token = saved;
    });

    it("DELETE /api/keys/:id revokes key", async () => {
      const { status, body } = await api(`/api/keys/${keyId}`, {
        method: "DELETE",
      });
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("Revoked key no longer authenticates", async () => {
      const res = await fetch(`${API_BASE}/api/inboxes`, {
        headers: { Authorization: `Bearer ${rawKey}` },
      });
      expect(res.status).toBe(401);
    });
  });

  // ─── Templates ──────────────────────────────────────────
  describe("Templates", () => {
    let templateId: string;

    it("POST /api/templates creates a template", async () => {
      const { status, body } = await api("/api/templates", {
        method: "POST",
        body: JSON.stringify({
          name: "Welcome Email",
          subject: "Hello {{name}}!",
          html: "<h1>Welcome, {{name}}!</h1><p>Your code: {{code}}</p>",
          text: "Welcome, {{name}}! Your code: {{code}}",
        }),
      });
      expect(status).toBe(201);
      expect(body.name).toBe("Welcome Email");
      expect(body.variables).toEqual(expect.arrayContaining(["name", "code"]));
      templateId = body.id;
    });

    it("POST /api/templates rejects missing name", async () => {
      const { status } = await api("/api/templates", {
        method: "POST",
        body: JSON.stringify({ html: "<p>test</p>" }),
      });
      expect(status).toBe(400);
    });

    it("GET /api/templates lists templates", async () => {
      const { status, body } = await api("/api/templates");
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((t: any) => t.id === templateId)).toBe(true);
    });

    it("GET /api/templates/:id returns template", async () => {
      const { status, body } = await api(`/api/templates/${templateId}`);
      expect(status).toBe(200);
      expect(body.name).toBe("Welcome Email");
    });

    it("PUT /api/templates/:id updates template", async () => {
      const { status, body } = await api(`/api/templates/${templateId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Updated Welcome",
          html: "<h1>Hello {{name}}!</h1>",
        }),
      });
      expect(status).toBe(200);
      expect(body.name).toBe("Updated Welcome");
      expect(body.variables).toContain("name");
    });

    it("DELETE /api/templates/:id deletes template", async () => {
      const { status, body } = await api(`/api/templates/${templateId}`, {
        method: "DELETE",
      });
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("GET /api/templates/:id returns 404 after deletion", async () => {
      const { status } = await api(`/api/templates/${templateId}`);
      expect(status).toBe(404);
    });
  });

  // ─── Suppressions ──────────────────────────────────────
  describe("Suppressions", () => {
    let suppressionId: string;

    it("POST /api/suppressions adds an address", async () => {
      const { status, body } = await api("/api/suppressions", {
        method: "POST",
        body: JSON.stringify({ email: "blocked@example.com" }),
      });
      expect(status).toBe(201);
      expect(body.email).toBe("blocked@example.com");
      suppressionId = body.id;
    });

    it("POST /api/suppressions rejects duplicate", async () => {
      const { status } = await api("/api/suppressions", {
        method: "POST",
        body: JSON.stringify({ email: "blocked@example.com" }),
      });
      expect(status).toBe(409);
    });

    it("POST /api/suppressions treats addresses case-insensitively", async () => {
      const { status } = await api("/api/suppressions", {
        method: "POST",
        body: JSON.stringify({ email: "  Blocked@Example.COM " }),
      });
      expect(status).toBe(409);
    });

    it.each(["", "   ", "not-an-email", "a@localhost", 42])(
      "POST /api/suppressions rejects invalid email %j",
      async (email) => {
        const { status } = await api("/api/suppressions", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        expect(status).toBe(400);
      },
    );

    it("POST /api/suppressions rejects an unknown reason", async () => {
      const { status } = await api("/api/suppressions", {
        method: "POST",
        body: JSON.stringify({
          email: "reason@example.com",
          reason: "x".repeat(80),
        }),
      });
      expect(status).toBe(400);
    });

    it("DELETE /api/suppressions/:id 404s on a malformed id", async () => {
      const { status } = await api("/api/suppressions/not-a-uuid", {
        method: "DELETE",
      });
      expect(status).toBe(404);
    });

    it("send skips a suppressed address whatever its case or display name", async () => {
      const inbox = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Suppression Send Inbox" }),
      });
      const { status, body } = await api("/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          inboxId: inbox.body.id,
          from: "test@example.com",
          to: ["Blocked <BLOCKED@example.com>"],
          subject: "Suppressed",
          text: "hi",
        }),
      });
      expect(status).toBe(422);
      expect(body.suppressedEmails).toEqual(["blocked@example.com"]);
    });

    it("GET /api/suppressions lists with pagination", async () => {
      const { status, body } = await api("/api/suppressions");
      expect(status).toBe(200);
      expect(body.suppressions).toBeDefined();
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.page).toBe(1);
    });

    it("GET /api/suppressions supports search", async () => {
      const { status, body } = await api("/api/suppressions?q=blocked@example");
      expect(status).toBe(200);
      expect(body.suppressions.length).toBeGreaterThanOrEqual(1);
    });

    it("DELETE /api/suppressions/:id removes address", async () => {
      const { status, body } = await api(`/api/suppressions/${suppressionId}`, {
        method: "DELETE",
      });
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  // ─── Teams ──────────────────────────────────────────────
  describe("Teams", () => {
    let teamId: string;

    it("POST /api/teams creates a team", async () => {
      const { status, body } = await api("/api/teams", {
        method: "POST",
        body: JSON.stringify({ name: "Test Team" }),
      });
      expect(status).toBe(201);
      expect(body.name).toBe("Test Team");
      teamId = body.id;
    });

    it("POST /api/teams rejects empty name", async () => {
      const { status } = await api("/api/teams", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      });
      expect(status).toBe(400);
    });

    it("GET /api/teams lists teams", async () => {
      const { status, body } = await api("/api/teams");
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((t: any) => t.id === teamId)).toBe(true);
    });

    it("GET /api/teams/:id returns team detail", async () => {
      const { status, body } = await api(`/api/teams/${teamId}`);
      expect(status).toBe(200);
      expect(body.name).toBe("Test Team");
    });

    it("PUT /api/teams/:id updates team", async () => {
      const { status, body } = await api(`/api/teams/${teamId}`, {
        method: "PUT",
        body: JSON.stringify({ name: "Renamed Team" }),
      });
      expect(status).toBe(200);
      expect(body.name).toBe("Renamed Team");
    });

    it("GET /api/teams/:id/members lists members", async () => {
      const { status, body } = await api(`/api/teams/${teamId}/members`);
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });

    it("DELETE /api/teams/:id deletes team", async () => {
      const { status } = await api(`/api/teams/${teamId}`, {
        method: "DELETE",
      });
      expect(status).toBe(204);
    });

    it("GET /api/teams/:id returns 404 after deletion", async () => {
      const { status } = await api(`/api/teams/${teamId}`);
      expect(status).toBe(404);
    });
  });

  // ─── Inbox Members ─────────────────────────────────────
  describe("Inbox Members", () => {
    let inboxId: string;

    beforeAll(async () => {
      const { body } = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Members Test Inbox" }),
      });
      inboxId = body.id;
    });

    it("GET /api/inboxes/:id/members lists members (includes owner)", async () => {
      const { status, body } = await api(`/api/inboxes/${inboxId}/members`);
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((m: any) => m.role === "owner")).toBe(true);
    });

    it("POST /api/inboxes/:id/members rejects invalid email", async () => {
      const { status } = await api(`/api/inboxes/${inboxId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: "not-a-user@nowhere.test" }),
      });
      expect(status).toBe(404);
    });

    afterAll(async () => {
      await api(`/api/inboxes/${inboxId}`, { method: "DELETE" });
    });
  });

  // ─── Send Email ─────────────────────────────────────────
  describe("Send Email", () => {
    let inboxId: string;

    beforeAll(async () => {
      const { body } = await api("/api/inboxes", {
        method: "POST",
        body: JSON.stringify({ name: "Send Test Inbox" }),
      });
      inboxId = body.id;
    });

    it("POST /v1/messages queues an email", async () => {
      const { status, body } = await api("/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          inboxId,
          from: "test@example.com",
          to: ["recipient@example.com"],
          subject: "Integration Test",
          html: "<p>Hello Test</p>",
        }),
      });
      expect(status).toBe(202);
      expect(body.id).toBeDefined();
      expect(body.status).toBeDefined();
    });

    it("POST /v1/messages rejects an invalid recipient", async () => {
      const { status } = await api("/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          inboxId,
          from: "test@example.com",
          to: ["not-an-email"],
          subject: "Bad recipient",
          text: "hi",
        }),
      });
      expect(status).toBe(400);
    });

    it("POST /api/messages/:id/forward rejects an invalid recipient", async () => {
      const sent = await api("/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          inboxId,
          from: "test@example.com",
          to: ["recipient@example.com"],
          subject: "Forward me",
          text: "hi",
        }),
      });
      const { status } = await api(`/api/messages/${sent.body.id}/forward`, {
        method: "POST",
        body: JSON.stringify({ to: "not-an-email" }),
      });
      expect(status).toBe(400);
    });

    it("POST /v1/messages rejects missing inboxId", async () => {
      const { status } = await api("/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          from: "test@example.com",
          to: ["recipient@example.com"],
          subject: "No Inbox",
          html: "<p>test</p>",
        }),
      });
      expect(status).toBe(400);
    });

    it("POST /v1/messages rejects invalid inbox", async () => {
      const { status } = await api("/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          inboxId: "00000000-0000-0000-0000-000000000000",
          from: "test@example.com",
          to: ["recipient@example.com"],
          subject: "Bad Inbox",
          html: "<p>test</p>",
        }),
      });
      expect(status).toBe(404);
    });

    it("POST /v1/messages/batch sends batch emails", async () => {
      const { status, body } = await api("/v1/messages/batch", {
        method: "POST",
        body: JSON.stringify({
          inboxId,
          from: "test@example.com",
          subject: "Batch Test",
          html: "<p>Hello</p>",
          recipients: [
            { to: "user1@example.com" },
            { to: "user2@example.com" },
          ],
        }),
      });
      expect(status).toBe(202);
      expect(body.count).toBe(2);
      expect(body.messageIds).toHaveLength(2);
    });

    afterAll(async () => {
      await api(`/api/inboxes/${inboxId}`, { method: "DELETE" });
    });
  });

  // ─── Admin Routes (requires admin) ─────────────────────
  describe("Admin Routes", () => {
    it("GET /api/admin/users rejects non-admin", async () => {
      const { status } = await api("/api/admin/users");
      expect(status).toBe(403);
    });

    it("PUT /api/admin/users/:id rejects non-admin", async () => {
      const { status } = await api(
        "/api/admin/users/00000000-0000-0000-0000-000000000000",
        {
          method: "PUT",
          body: JSON.stringify({ role: "admin" }),
        },
      );
      expect(status).toBe(403);
    });

    it("DELETE /api/admin/users/:id rejects non-admin", async () => {
      const { status } = await api(
        "/api/admin/users/00000000-0000-0000-0000-000000000000",
        { method: "DELETE" },
      );
      expect(status).toBe(403);
    });

    // Admin-authenticated tests (only run if ADMIN_EMAIL/ADMIN_PASSWORD are set)
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
      let adminToken: string;

      it("Admin can login", async () => {
        const saved = token;
        token = "";
        const { status, body } = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: adminEmail,
            password: adminPassword,
          }),
        });
        expect(status).toBe(200);
        expect(body.user.role).toBe("admin");
        adminToken = body.token;
        token = saved;
      });

      it("GET /api/admin/users lists users as admin", async () => {
        const saved = token;
        token = adminToken;
        const { status, body } = await api("/api/admin/users");
        expect(status).toBe(200);
        expect(body.data).toBeDefined();
        expect(body.pagination).toBeDefined();
        expect(body.pagination.total).toBeGreaterThanOrEqual(1);
        token = saved;
      });

      it("PUT /api/admin/users rejects self-demotion", async () => {
        const saved = token;
        token = adminToken;
        // Get admin's own ID
        const { body: listBody } = await api(
          `/api/admin/users?search=${encodeURIComponent(adminEmail)}`,
        );
        const adminUserId = listBody.data[0]?.id;
        if (adminUserId) {
          const { status } = await api(`/api/admin/users/${adminUserId}`, {
            method: "PUT",
            body: JSON.stringify({ role: "user" }),
          });
          expect(status).toBe(400);
        }
        token = saved;
      });
    }
  });

  // ─── Analytics & Quotas ────────────────────────────────
  describe("Analytics & Quotas", () => {
    it("GET /api/analytics/overview returns analytics", async () => {
      const { status, body } = await api("/api/analytics/overview?period=30d");
      expect(status).toBe(200);
      expect(body.totalSent).toBeDefined();
    });

    it("GET /api/analytics/timeseries returns chart data", async () => {
      const { status, body } = await api(
        "/api/analytics/timeseries?metric=sent&period=30d",
      );
      expect(status).toBe(200);
      expect(body.labels).toBeDefined();
      expect(body.values).toBeDefined();
    });

    it("GET /api/analytics/bounce-rate returns bounce data", async () => {
      const { status, body } = await api(
        "/api/analytics/bounce-rate?period=30d",
      );
      expect(status).toBe(200);
      expect(body.labels).toBeDefined();
    });

    it("GET /api/analytics/top-recipients returns domains", async () => {
      const { status, body } = await api("/api/analytics/top-recipients");
      expect(status).toBe(200);
      expect(body.domains).toBeDefined();
    });

    it("GET /api/quotas returns account usage", async () => {
      const { status, body } = await api("/api/account/usage");
      expect(status).toBe(200);
      expect(body.monthlySendLimit).toBeDefined();
      expect(body.currentMonthlySent).toBeDefined();
      expect(body.maxInboxes).toBeDefined();
    });
  });
});
