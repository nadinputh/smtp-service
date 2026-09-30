import { describe, it, expect } from "vitest";
import {
  signTrackedLink,
  verifyTrackedLink,
} from "../src/tracking-signature.js";

const secret = "test-secret-test-secret";
const id = "11111111-1111-4111-8111-111111111111";

describe("tracked link signatures", () => {
  it("verifies a signature made for the same message and url", () => {
    const sig = signTrackedLink(secret, id, "https://example.com/a");
    expect(verifyTrackedLink(secret, id, "https://example.com/a", sig)).toBe(
      true,
    );
  });

  it("rejects a different url, message, secret, or malformed sig", () => {
    const sig = signTrackedLink(secret, id, "https://example.com/a");
    expect(verifyTrackedLink(secret, id, "https://evil.example/a", sig)).toBe(
      false,
    );
    expect(
      verifyTrackedLink(secret, "other", "https://example.com/a", sig),
    ).toBe(false);
    expect(
      verifyTrackedLink(
        "other-secret-other-secret",
        id,
        "https://example.com/a",
        sig,
      ),
    ).toBe(false);
    expect(
      verifyTrackedLink(secret, id, "https://example.com/a", undefined),
    ).toBe(false);
    expect(
      verifyTrackedLink(secret, id, "https://example.com/a", "short"),
    ).toBe(false);
    expect(verifyTrackedLink(secret, id, "https://example.com/a", ["x"])).toBe(
      false,
    );
  });
});
