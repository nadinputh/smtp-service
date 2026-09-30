import { describe, it, expect } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  isEncrypted,
} from "../src/secret-box.js";
import { domainAndParents } from "../src/sender-domain.js";

const secret = "k".repeat(32);
const pem = "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n";

describe("secret-box", () => {
  it("round-trips and does not store the plaintext", () => {
    const stored = encryptSecret(pem, secret);
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("BEGIN PRIVATE KEY");
    expect(decryptSecret(stored, secret)).toBe(pem);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret(pem, secret)).not.toBe(encryptSecret(pem, secret));
  });

  it("passes legacy plaintext through and stores as-is without a secret", () => {
    expect(encryptSecret(pem)).toBe(pem);
    expect(decryptSecret(pem, secret)).toBe(pem);
    expect(decryptSecret(pem)).toBe(pem);
  });

  it("refuses a wrong secret, a missing secret, or tampered data", () => {
    const stored = encryptSecret(pem, secret);
    expect(() => decryptSecret(stored, "x".repeat(32))).toThrow();
    expect(() => decryptSecret(stored)).toThrow(/DKIM_ENCRYPTION_KEY/);
    const parts = stored.split(":");
    parts[4] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join(":"), secret)).toThrow();
  });
});

describe("rotation", () => {
  it("reads a value encrypted with the previous secret", () => {
    const old = "o".repeat(32);
    const stored = encryptSecret(pem, old);
    expect(decryptSecret(stored, secret, old)).toBe(pem);
    expect(() => decryptSecret(stored, secret)).toThrow();
  });
});

describe("domainAndParents", () => {
  it("lists the domain and each parent with at least two labels", () => {
    expect(domainAndParents("a.b.example.com")).toEqual([
      "a.b.example.com",
      "b.example.com",
      "example.com",
    ]);
    expect(domainAndParents("example.com")).toEqual(["example.com"]);
  });
});
