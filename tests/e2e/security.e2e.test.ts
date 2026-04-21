/**
 * E2E Security Test Suite
 *
 * Tests authentication, authorization, input validation, injection prevention,
 * rate limiting, and security headers across the full HTTP stack.
 *
 * Requirements:
 *   docker compose up -d postgres redis minio
 *   pnpm dev:api  (or run the API server)
 *
 * Run:
 *   API_BASE=http://localhost:3001 pnpm vitest run tests/e2e/security.e2e.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";

const API_BASE = process.env.API_BASE ?? "http://localhost:3001";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
async function api(path: string, opts: RequestInit & { token?: string } = {}) {
  const { token, ...fetchOpts } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOpts.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_BASE}${path}`, {
    ...fetchOpts,
    headers,
    redirect: "manual",
  });
}

const unique = () =>
  `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

let validToken: string;
let validUserId: string;
const testEmail = `${unique()}@test.local`;
const testPassword = "SecureP4ss!";

// ────────────────────────────────────────────────────────────
// Setup — create a test user
// ────────────────────────────────────────────────────────────
beforeAll(async () => {
  const res = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const data = (await res.json()) as any;
  validToken = data.token;
  validUserId = data.user?.id;
});

// ────────────────────────────────────────────────────────────
// 1. Security Headers
// ────────────────────────────────────────────────────────────
describe("Security Headers", () => {
  it("returns Content-Security-Policy header", async () => {
    const res = await api("/health");
    expect(res.headers.get("content-security-policy")).toBeTruthy();
  });

  it("returns X-Content-Type-Options: nosniff", async () => {
    const res = await api("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns X-Frame-Options header", async () => {
    const res = await api("/health");
    const xfo = res.headers.get("x-frame-options");
    expect(xfo).toBeTruthy();
  });

  it("returns Strict-Transport-Security header", async () => {
    const res = await api("/health");
    expect(res.headers.get("strict-transport-security")).toBeTruthy();
  });

  it("returns X-DNS-Prefetch-Control header", async () => {
    const res = await api("/health");
    expect(res.headers.get("x-dns-prefetch-control")).toBeTruthy();
  });
});

// ────────────────────────────────────────────────────────────
// 2. Authentication
// ────────────────────────────────────────────────────────────
describe("Authentication", () => {
  it("rejects requests without Authorization header", async () => {
    const res = await api("/api/inboxes");
    expect(res.status).toBe(401);
  });

  it("rejects requests with malformed Bearer token", async () => {
    const res = await api("/api/inboxes", { token: "not-a-valid-jwt" });
    expect(res.status).toBe(401);
  });

  it("rejects expired/tampered JWT", async () => {
    const fakeToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
      "eyJ1c2VySWQiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJlbWFpbCI6ImZha2VAZXZpbC5jb20iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDAwMX0." +
      "invalid_signature";
    const res = await api("/api/inboxes", { token: fakeToken });
    expect(res.status).toBe(401);
  });

  it("rejects invalid API key prefix", async () => {
    const res = await api("/api/inboxes", { token: "smtps_fake_key_here" });
    expect(res.status).toBe(401);
  });

  it("accepts valid JWT token", async () => {
    const res = await api("/api/inboxes", { token: validToken });
    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────
// 3. Password Strength Enforcement
// ────────────────────────────────────────────────────────────
describe("Password Strength", () => {
  it("rejects passwords shorter than 8 characters", async () => {
    const res = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: `${unique()}@test.local`,
        password: "Ab1",
      }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.error).toMatch(/8 characters/i);
  });

  it("rejects passwords without uppercase", async () => {
    const res = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: `${unique()}@test.local`,
        password: "alllower1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects passwords without numbers", async () => {
    const res = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: `${unique()}@test.local`,
        password: "NoNumbers!",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts strong passwords", async () => {
    const res = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: `${unique()}@test.local`,
        password: "StrongP4ss!",
      }),
    });
    expect(res.status).toBe(201);
  });
});

// ────────────────────────────────────────────────────────────
// 4. Authorization (IDOR)
// ────────────────────────────────────────────────────────────
describe("Authorization / IDOR Prevention", () => {
  let otherToken: string;
  let inboxId: string;

  beforeAll(async () => {
    // Create second user
    const res2 = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: `${unique()}@test.local`,
        password: "OtherP4ss!",
      }),
    });
    const d2 = (await res2.json()) as any;
    otherToken = d2.token;

    // First user creates an inbox
    const inboxRes = await api("/api/inboxes", {
      method: "POST",
      token: validToken,
      body: JSON.stringify({ name: "IDOR Test Inbox" }),
    });
    const inboxData = (await inboxRes.json()) as any;
    inboxId = inboxData.id;
  });

  it("prevents access to another user's inbox", async () => {
    const res = await api(`/api/inboxes/${inboxId}`, { token: otherToken });
    expect(res.status).toBe(404); // Should not leak existence
  });

  it("prevents deletion of another user's inbox", async () => {
    const res = await api(`/api/inboxes/${inboxId}`, {
      method: "DELETE",
      token: otherToken,
    });
    expect([400, 404]).toContain(res.status);
  });

  it("returns 404 for non-existent resource (no info leak)", async () => {
    const res = await api("/api/inboxes/00000000-0000-0000-0000-000000000000", {
      token: validToken,
    });
    expect([400, 404]).toContain(res.status);
  });
});

// ────────────────────────────────────────────────────────────
// 5. Admin Endpoint Protection
// ────────────────────────────────────────────────────────────
describe("Admin Endpoint Protection", () => {
  it("denies non-admin user access to admin routes", async () => {
    const res = await api("/api/admin/users", { token: validToken });
    expect(res.status).toBe(403);
  });

  it("denies unauthenticated access to admin routes", async () => {
    const res = await api("/api/admin/users");
    expect(res.status).toBe(401);
  });
});

// ────────────────────────────────────────────────────────────
// 6. Input Validation & Injection
// ────────────────────────────────────────────────────────────
describe("Input Validation & Injection", () => {
  it("rejects SQL injection in query parameters", async () => {
    const res = await api("/api/inboxes?page=1&limit=10;DROP TABLE users;--", {
      token: validToken,
    });
    // Should not cause a 500 (server error from SQL injection)
    expect(res.status).not.toBe(500);
  });

  it("handles XSS payloads in request body gracefully", async () => {
    const xssPayload = '<script>alert("xss")</script>';
    const res = await api("/api/inboxes", {
      method: "POST",
      token: validToken,
      body: JSON.stringify({ name: xssPayload }),
    });
    // Should accept (stored data) but the response should not execute scripts
    // due to CSP headers. The name is just stored as data.
    if (res.status === 201 || res.status === 200) {
      const data = (await res.json()) as any;
      // Verify CSP header is present to block XSS execution
      expect(res.headers.get("content-security-policy")).toBeTruthy();
    }
  });

  it("rejects NoSQL/prototype pollution in JSON body", async () => {
    const res = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: { $gt: "" },
        password: { $gt: "" },
      }),
    });
    // Should not authenticate
    expect([400, 401]).toContain(res.status);
  });

  it("rejects oversized request bodies", async () => {
    const bigPayload = "A".repeat(50 * 1024 * 1024); // 50MB
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: bigPayload, password: "test" }),
    }).catch(() => null);
    // Should either reject or not crash the server
    if (res) {
      expect([400, 413, 431]).toContain(res.status);
    }
  });

  it("handles null bytes in input", async () => {
    const res = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "test\x00@evil.com",
        password: "password\x00injected",
      }),
    });
    expect([400, 401]).toContain(res.status);
  });
});

// ────────────────────────────────────────────────────────────
// 7. Open Redirect Prevention
// ────────────────────────────────────────────────────────────
describe("Open Redirect Prevention", () => {
  it("blocks javascript: protocol in click tracking", async () => {
    const res = await api(
      `/t/click/00000000-0000-0000-0000-000000000000?url=javascript:alert(1)`,
    );
    expect(res.status).toBe(400);
  });

  it("blocks data: protocol in click tracking", async () => {
    const res = await api(
      `/t/click/00000000-0000-0000-0000-000000000000?url=data:text/html,<script>alert(1)</script>`,
    );
    expect(res.status).toBe(400);
  });

  it("allows legitimate https redirects", async () => {
    const res = await api(
      `/t/click/00000000-0000-0000-0000-000000000000?url=https://example.com`,
    );
    // Should redirect (302) or not found (if messageId doesn't exist)
    expect([302, 200]).toContain(res.status);
  });
});

// ────────────────────────────────────────────────────────────
// 8. User Enumeration Prevention
// ────────────────────────────────────────────────────────────
describe("User Enumeration Prevention", () => {
  it("returns same error for non-existent and wrong-password login", async () => {
    const nonExistent = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "definitely-not-exists@test.local",
        password: "SomeP4ss!",
      }),
    });
    const wrongPassword = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: testEmail,
        password: "WrongP4ss!",
      }),
    });

    const d1 = (await nonExistent.json()) as any;
    const d2 = (await wrongPassword.json()) as any;

    // Both should return 401 with the same generic message
    expect(nonExistent.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(d1.error).toBe(d2.error);
  });
});

// ────────────────────────────────────────────────────────────
// 9. CORS
// ────────────────────────────────────────────────────────────
describe("CORS", () => {
  it("responds to preflight OPTIONS requests", async () => {
    const res = await fetch(`${API_BASE}/api/inboxes`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.com",
        "Access-Control-Request-Method": "POST",
      },
    });
    // In production with restricted CORS, this should not echo back the evil origin
    // In testing mode, it may be permissive
    expect(res.status).toBeLessThan(500);
  });
});

// ────────────────────────────────────────────────────────────
// 10. Path Traversal
// ────────────────────────────────────────────────────────────
describe("Path Traversal", () => {
  it("rejects path traversal in resource IDs", async () => {
    const res = await api("/api/inboxes/../../../etc/passwd", {
      token: validToken,
    });
    expect([400, 404]).toContain(res.status);
  });

  it("rejects encoded path traversal", async () => {
    const res = await api("/api/inboxes/%2e%2e%2f%2e%2e%2fetc%2fpasswd", {
      token: validToken,
    });
    expect([400, 404]).toContain(res.status);
  });
});

// ────────────────────────────────────────────────────────────
// 11. Health Check (no sensitive data leakage)
// ────────────────────────────────────────────────────────────
describe("Information Leakage", () => {
  it("health endpoint does not leak stack traces", async () => {
    const res = await api("/health");
    const data = (await res.json()) as any;
    expect(data).not.toHaveProperty("stack");
    expect(JSON.stringify(data)).not.toMatch(/node_modules/);
  });

  it("404 responses do not leak server internals", async () => {
    const res = await api("/api/nonexistent-route");
    const text = await res.text();
    expect(text).not.toMatch(/node_modules/);
    expect(text).not.toMatch(/fastify/i);
  });
});

// ────────────────────────────────────────────────────────────
// 12. HTTP Method Enforcement
// ────────────────────────────────────────────────────────────
describe("HTTP Method Enforcement", () => {
  it("rejects non-standard methods", async () => {
    await expect(
      fetch(`${API_BASE}/api/inboxes`, {
        method: "TRACE",
      }),
    ).rejects.toThrow();
  });
});
