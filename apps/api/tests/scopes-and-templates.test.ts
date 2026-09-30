import { describe, it, expect } from "vitest";
import { substituteVariables } from "../src/routes/send.js";
import { requiredApiKeyScope, hashApiKey } from "../src/middleware/auth.js";
import { cleanString, isOptionalString } from "../src/lib/validate.js";

describe("substituteVariables", () => {
  it("replaces own scalar values and leaves unknown keys", () => {
    expect(substituteVariables("Hi {{name}} {{x}}", { name: "Ann" })).toBe(
      "Hi Ann {{x}}",
    );
    expect(substituteVariables("{{n}}", { n: 5 })).toBe("5");
  });

  it("does not resolve inherited properties or objects", () => {
    expect(substituteVariables("{{constructor}}", {})).toBe("{{constructor}}");
    expect(substituteVariables("{{o}}", { o: { a: 1 } })).toBe("{{o}}");
  });

  it("escapes values only for HTML bodies", () => {
    const vars = { n: `<b>"x"&'y'</b>` };
    expect(substituteVariables("{{n}}", vars, true)).toBe(
      "&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;",
    );
    expect(substituteVariables("{{n}}", vars)).toBe(vars.n);
  });
});

describe("requiredApiKeyScope", () => {
  it.each([
    ["GET", "/api/templates", "read"],
    ["HEAD", "/api/inboxes", "read"],
    ["DELETE", "/api/templates/:id", "delete"],
    ["POST", "/v1/messages", "send"],
    ["POST", "/v1/messages/batch", "send"],
    ["POST", "/api/messages/:id/forward", "send"],
  ])("%s %s needs %s", (m, r, scope) => {
    expect(requiredApiKeyScope(m, r)).toBe(scope);
  });

  it.each([
    ["GET", "/api/keys"],
    ["POST", "/api/keys"],
    ["DELETE", "/api/keys/:id"],
    ["GET", "/api/auth/me"],
    ["GET", "/api/admin/users"],
    ["POST", "/api/suppressions"],
    ["PUT", "/api/templates/:id"],
  ])("%s %s is session-only", (m, r) => {
    expect(requiredApiKeyScope(m, r)).toBeNull();
  });
});

describe("hashApiKey", () => {
  it("is a stable 64-char hex digest", () => {
    expect(hashApiKey("smtps_live_x")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey("a")).toBe(hashApiKey("a"));
    expect(hashApiKey("a")).not.toBe(hashApiKey("b"));
  });
});

describe("validate helpers", () => {
  it("cleanString trims and enforces bounds", () => {
    expect(cleanString("  a ", 5)).toBe("a");
    expect(cleanString("   ", 5)).toBeNull();
    expect(cleanString("abcdef", 5)).toBeNull();
    expect(cleanString(5, 5)).toBeNull();
  });

  it("isOptionalString allows missing values only", () => {
    expect(isOptionalString(undefined, 3)).toBe(true);
    expect(isOptionalString(null, 3)).toBe(true);
    expect(isOptionalString("abc", 3)).toBe(true);
    expect(isOptionalString("abcd", 3)).toBe(false);
    expect(isOptionalString(1, 3)).toBe(false);
  });
});
