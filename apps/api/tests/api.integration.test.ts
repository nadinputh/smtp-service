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

    it("DELETE /api/domains/:id deletes domain", async () => {
      const { status, body } = await api(`/api/domains/${domainId}`, {
        method: "DELETE",
      });
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe("Tracking Endpoints", () => {
    it("GET /t/open/:messageId returns tracking pixel", async () => {
      const res = await fetch(`${API_BASE}/t/open/fake-message-id`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/gif");
    });

    it("GET /t/click/:messageId redirects to url", async () => {
      const res = await fetch(
        `${API_BASE}/t/click/fake-message-id?url=${encodeURIComponent("https://example.com")}`,
        { redirect: "manual" },
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("example.com");
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
