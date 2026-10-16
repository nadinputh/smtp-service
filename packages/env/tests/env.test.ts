import { describe, it, expect } from "vitest";
import { envSchema } from "../src/index.js";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_SECRET: "x".repeat(40),
};
const production = {
  ...base,
  APP_MODE: "production",
  SYSTEM_EMAIL_FROM: "noreply@example.com",
  DKIM_ENCRYPTION_KEY: "k".repeat(32),
};

describe("production JWT_SECRET", () => {
  it("accepts a long random secret", () => {
    expect(envSchema.safeParse(production).success).toBe(true);
  });

  it("rejects short secrets", () => {
    expect(
      envSchema.safeParse({ ...production, JWT_SECRET: "short-secret-16chars" })
        .success,
    ).toBe(false);
  });

  it("rejects the .env.example placeholder", () => {
    expect(
      envSchema.safeParse({
        ...production,
        JWT_SECRET: "change-me-to-a-random-secret-at-least-16-chars",
      }).success,
    ).toBe(false);
  });

  it("still allows short secrets in testing mode", () => {
    expect(
      envSchema.safeParse({ ...base, JWT_SECRET: "ci-test-secret-min-16chars" })
        .success,
    ).toBe(true);
  });
});
