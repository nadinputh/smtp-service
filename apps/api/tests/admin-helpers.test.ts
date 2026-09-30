import { describe, it, expect } from "vitest";
import { passwordPolicyError } from "../src/lib/password-policy.js";
import {
  parsePeriod,
  windowStart,
  dayLabels,
  isMetric,
} from "../src/lib/analytics.js";
import { escapeLike, clampInt } from "../src/lib/validate.js";

describe("passwordPolicyError", () => {
  it("accepts a compliant password", () => {
    expect(passwordPolicyError("Passw0rdX")).toBeNull();
  });

  it("rejects non-strings and over-long (bcrypt-truncated) passwords", () => {
    expect(passwordPolicyError(12345678)).not.toBeNull();
    expect(passwordPolicyError(["Passw0rdX"])).not.toBeNull();
    expect(passwordPolicyError("Aa1" + "x".repeat(70))).not.toBeNull();
    expect(passwordPolicyError("Aa1" + "x".repeat(69))).toBeNull();
  });

  it("counts bytes, not characters", () => {
    expect(passwordPolicyError("Aa1" + "é".repeat(35))).not.toBeNull();
  });
});

describe("analytics helpers", () => {
  it("parsePeriod defaults to 30d and rejects unknown values", () => {
    expect(parsePeriod(undefined)).toEqual({ key: "30d", days: 30 });
    expect(parsePeriod("7d")).toEqual({ key: "7d", days: 7 });
    expect(parsePeriod("1y")).toBeNull();
    expect(parsePeriod("constructor")).toBeNull();
  });

  it("the window ends today and spans exactly `days` labels", () => {
    const labels = dayLabels(windowStart(7), 7);
    expect(labels).toHaveLength(7);
    expect(labels.at(-1)).toBe(new Date().toISOString().slice(0, 10));
    expect(new Set(labels).size).toBe(7);
  });

  it("isMetric only accepts known metrics", () => {
    expect(isMetric("bounced")).toBe(true);
    expect(isMetric("toString")).toBe(false);
    expect(isMetric(undefined)).toBe(false);
  });
});

describe("validate helpers", () => {
  it("escapeLike escapes wildcards and backslashes", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("clampInt bounds junk, negatives and huge values", () => {
    expect(clampInt(undefined, 20, 100)).toBe(20);
    expect(clampInt("abc", 20, 100)).toBe(20);
    expect(clampInt("-5", 20, 100)).toBe(1);
    expect(clampInt("500", 20, 100)).toBe(100);
    expect(clampInt("7", 20, 100)).toBe(7);
  });
});
