import { describe, it, expect } from "vitest";
import {
  extractSmtpCode,
  classifySmtpError,
  extractSenderDomain,
  isRecipientRejection,
} from "../src/outbound.js";

describe("extractSmtpCode", () => {
  it("uses the real SMTP response code when the server actually replied", () => {
    const err = { responseCode: 550, message: "550 5.1.1 user unknown" };
    expect(extractSmtpCode(err)).toBe(550);
  });

  it("does not classify a connection timeout as a 5xx bounce", () => {
    // Exactly what nodemailer's smtp-connection throws when the initial
    // connect() call times out: no SMTP dialogue ever happened, so there
    // is no responseCode — only a short error `code`.
    const err = { code: "ETIMEDOUT", message: "Connection timeout" };
    const code = extractSmtpCode(err);
    expect(code).not.toBe(550);
    expect(classifySmtpError(code)).toBe("temporary");
  });

  it("treats a socket error the same way", () => {
    const err = { code: "ESOCKET", message: "socket hang up" };
    expect(classifySmtpError(extractSmtpCode(err))).toBe("temporary");
  });

  it("treats a connection-refused error the same way", () => {
    const err = { code: "ECONNECTION", message: "Connection refused" };
    expect(classifySmtpError(extractSmtpCode(err))).toBe("temporary");
  });

  it("still parses a genuine 4xx/5xx code embedded in the message text", () => {
    const err = { message: "452 4.2.2 mailbox full" };
    expect(extractSmtpCode(err)).toBe(452);
  });

  it("defaults to temporary, not permanent, when nothing is recognizable", () => {
    const err = { message: "something unexpected happened" };
    expect(classifySmtpError(extractSmtpCode(err))).toBe("temporary");
  });
});

describe("classifySmtpError", () => {
  it("classifies 4xx as temporary", () => {
    expect(classifySmtpError(421)).toBe("temporary");
    expect(classifySmtpError(450)).toBe("temporary");
  });

  it("classifies 5xx as permanent", () => {
    expect(classifySmtpError(550)).toBe("permanent");
    expect(classifySmtpError(553)).toBe("permanent");
  });
});

describe("extractSenderDomain", () => {
  it("handles bare and display-name senders, lowercased", () => {
    expect(extractSenderDomain("hi@Acme.com")).toBe("acme.com");
    expect(extractSenderDomain("Acme <hi@acme.com>")).toBe("acme.com");
  });

  it("returns null when there is no domain", () => {
    expect(extractSenderDomain("nobody")).toBeNull();
    expect(extractSenderDomain("nobody@")).toBeNull();
  });
});

describe("isRecipientRejection", () => {
  it("is true for nonexistent-mailbox rejections", () => {
    expect(isRecipientRejection({ message: "550 5.1.1 user unknown" })).toBe(
      true,
    );
    expect(isRecipientRejection({ response: "550 No such user here" })).toBe(
      true,
    );
  });

  it("is false for policy, reputation, and mailbox-full rejections", () => {
    expect(
      isRecipientRejection({ message: "554 5.7.1 blocked by policy" }),
    ).toBe(false);
    expect(isRecipientRejection({ message: "552 5.2.2 mailbox full" })).toBe(
      false,
    );
    expect(
      isRecipientRejection({ message: "550 sender IP listed on blocklist" }),
    ).toBe(false);
  });
});
