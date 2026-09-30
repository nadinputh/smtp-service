import { describe, it, expect } from "vitest";
import { requiredApiKeyScope, API_KEY_SCOPES } from "../src/middleware/auth.js";
import {
  API_ENDPOINTS,
  API_KEY_SCOPE_INFO,
} from "../../web/composables/apiDocs.js";

describe("API docs data", () => {
  it.each(API_ENDPOINTS.map((e) => [e.method, e.path, e.scope]))(
    "%s %s needs the %s scope",
    (method, path, scope) => {
      expect(requiredApiKeyScope(method, path)).toBe(scope);
    },
  );

  it("documents exactly the scopes the API accepts", () => {
    expect(API_KEY_SCOPE_INFO.map((s) => s.value).sort()).toEqual(
      [...API_KEY_SCOPES].sort(),
    );
  });
});
