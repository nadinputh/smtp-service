import { describe, it, expect } from "vitest";
import { webhookUrlError } from "../src/routes/webhooks.js";

describe("webhookUrlError", () => {
  it("accepts public http(s) URLs in either mode", () => {
    expect(webhookUrlError("https://hooks.example.com/x?y=1", true)).toBeNull();
    expect(webhookUrlError("http://example.com", false)).toBeNull();
  });

  it.each([
    "",
    "not a url",
    "ftp://example.com",
    "javascript:alert(1)",
    "https://user:pw@example.com/",
    `https://example.com/${"a".repeat(2100)}`,
  ])("always rejects %j", (u) => {
    expect(webhookUrlError(u, false)).not.toBeNull();
  });

  it("rejects non-strings", () => {
    expect(webhookUrlError(undefined, false)).not.toBeNull();
    expect(webhookUrlError(["https://example.com"], false)).not.toBeNull();
  });

  it.each([
    "http://localhost:3000/hook",
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://[::ffff:7f00:1]/",
    "http://10.0.0.5/",
    "http://db.internal/",
  ])("blocks %s in production only", (u) => {
    expect(webhookUrlError(u, true)).not.toBeNull();
    expect(webhookUrlError(u, false)).toBeNull();
  });
});
