import { describe, it, expect } from "vitest";
import { emailClaimTrusted } from "../src/lib/sso-user.js";
import {
  sealSmtpPassword,
  revealSmtpPassword,
} from "../src/lib/smtp-credentials.js";

describe("emailClaimTrusted", () => {
  it("trusts only an explicit true by default", () => {
    expect(emailClaimTrusted(true, false)).toBe(true);
    expect(emailClaimTrusted(false, false)).toBe(false);
    expect(emailClaimTrusted(undefined, false)).toBe(false);
    expect(emailClaimTrusted("true", false)).toBe(false);
  });

  it("accepts a missing claim only when the operator opted in", () => {
    expect(emailClaimTrusted(undefined, true)).toBe(true);
    expect(emailClaimTrusted(false, true)).toBe(false);
  });
});

describe("SMTP password sealing", () => {
  const key = "k".repeat(40);

  it("encrypts at rest and round-trips", () => {
    const sealed = sealSmtpPassword("s3cret", { DKIM_ENCRYPTION_KEY: key });
    expect(sealed).not.toContain("s3cret");
    expect(
      revealSmtpPassword(sealed, { DKIM_ENCRYPTION_KEY: key }),
    ).toBe("s3cret");
  });

  it("reads values sealed under the previous key during rotation", () => {
    const old = "o".repeat(40);
    const sealed = sealSmtpPassword("s3cret", { DKIM_ENCRYPTION_KEY: old });
    expect(
      revealSmtpPassword(sealed, {
        DKIM_ENCRYPTION_KEY: key,
        DKIM_ENCRYPTION_KEY_PREVIOUS: old,
      }),
    ).toBe("s3cret");
  });

  it("passes plaintext through when no key is configured", () => {
    expect(sealSmtpPassword("plain", {})).toBe("plain");
    expect(revealSmtpPassword("plain", {})).toBe("plain");
  });
});
