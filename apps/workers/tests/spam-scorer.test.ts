import { describe, it, expect } from "vitest";
import { scoreEmail, type SpamResult } from "../src/spam-scorer.js";

// Minimal ParsedMail-like helper
function makeParsed(opts: {
  subject?: string;
  text?: string;
  html?: string;
  from?: string;
  headers?: Record<string, string>;
}): any {
  const headerMap = new Map<string, string>();
  // Default headers so tests start with a clean slate where intended
  headerMap.set("message-id", "<test@example.com>");
  headerMap.set("date", new Date().toISOString());
  headerMap.set("mime-version", "1.0");
  headerMap.set("dkim-signature", "v=1");
  headerMap.set("received", "from mail.example.com");
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      if (v === "") {
        headerMap.delete(k);
      } else {
        headerMap.set(k, v);
      }
    }
  }
  return {
    subject: opts.subject ?? "Test Subject",
    text: opts.text ?? "Normal text body with enough content to pass checks.",
    html: opts.html || "",
    from: opts.from ? { text: opts.from } : { text: "user@example.com" },
    headers: headerMap,
  };
}

function rawFrom(headers: Record<string, string> = {}): string {
  const lines = Object.entries(headers).map(([k, v]) => `${k}: ${v}`);
  lines.push("Content-Type: text/plain; charset=utf-8");
  lines.push("");
  lines.push("body");
  return lines.join("\r\n");
}

describe("scoreEmail", () => {
  it("returns clean verdict for normal email", () => {
    const parsed = makeParsed({});
    const result = scoreEmail(parsed, rawFrom(), "user@example.com");
    expect(result.verdict).toBe("clean");
    expect(result.score).toBeLessThan(3);
  });

  it("flags all-caps subject", () => {
    const parsed = makeParsed({ subject: "BUY NOW FREE STUFF" });
    const result = scoreEmail(parsed, rawFrom());
    const ruleNames = result.rules.map((r) => r.rule);
    expect(ruleNames).toContain("SUBJ_ALL_CAPS");
  });

  it("flags missing subject", () => {
    const parsed = makeParsed({ subject: "" });
    const result = scoreEmail(parsed, rawFrom());
    expect(result.rules.some((r) => r.rule === "MISSING_SUBJECT")).toBe(true);
  });

  it("flags spam trigger words in subject", () => {
    const parsed = makeParsed({
      subject: "Congratulations! You are a winner!",
    });
    const result = scoreEmail(parsed, rawFrom());
    expect(result.rules.some((r) => r.rule === "SUBJ_SPAM_WORDS")).toBe(true);
  });

  it("flags excessive punctuation in subject", () => {
    const parsed = makeParsed({ subject: "Hello!!! Great offer???" });
    const result = scoreEmail(parsed, rawFrom());
    expect(
      result.rules.some((r) => r.rule === "SUBJ_EXCESSIVE_PUNCTUATION"),
    ).toBe(true);
  });

  it("flags pharmaceutical spam keywords", () => {
    const parsed = makeParsed({
      text: "Buy cheap viagra and cialis pills now",
    });
    const result = scoreEmail(parsed, rawFrom());
    expect(result.rules.some((r) => r.rule === "BODY_PHARMA_SPAM")).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it("flags advance-fee fraud", () => {
    const parsed = makeParsed({
      text: "A nigerian prince wants to wire transfer million dollars to your bank account",
    });
    const result = scoreEmail(parsed, rawFrom());
    expect(result.rules.some((r) => r.rule === "BODY_ADVANCE_FEE")).toBe(true);
  });

  it("flags money offers", () => {
    const parsed = makeParsed({ text: "Get $1,000,000 today or 50% off" });
    const result = scoreEmail(parsed, rawFrom());
    expect(result.rules.some((r) => r.rule === "BODY_MONEY_OFFERS")).toBe(true);
  });

  it("flags HTML-only email (no text alternative)", () => {
    const parsed = makeParsed({
      text: "",
      html: "<h1>Hello</h1><p>This is an email</p>",
    });
    const result = scoreEmail(parsed, rawFrom());
    expect(result.rules.some((r) => r.rule === "HTML_ONLY")).toBe(true);
  });

  it("flags image-only HTML", () => {
    const parsed = makeParsed({
      text: "",
      html: '<img src="banner.jpg" /><img src="logo.png" />',
    });
    const result = scoreEmail(parsed, rawFrom());
    expect(result.rules.some((r) => r.rule === "IMAGE_ONLY")).toBe(true);
  });

  it("flags excessive links", () => {
    const links = Array.from(
      { length: 25 },
      (_, i) => `<a href="https://example.com/${i}">Link</a>`,
    ).join("");
    const parsed = makeParsed({ html: links, text: "Check these links" });
    const result = scoreEmail(parsed, rawFrom());
    expect(result.rules.some((r) => r.rule === "EXCESSIVE_LINKS")).toBe(true);
  });

  it("flags missing Message-ID", () => {
    const parsed = makeParsed({ headers: { "message-id": "" } });
    const result = scoreEmail(parsed, rawFrom());
    expect(result.rules.some((r) => r.rule === "MISSING_MESSAGE_ID")).toBe(
      true,
    );
  });

  it("flags missing DKIM signature", () => {
    const parsed = makeParsed({ headers: { "dkim-signature": "" } });
    const result = scoreEmail(parsed, rawFrom());
    expect(result.rules.some((r) => r.rule === "NO_DKIM")).toBe(true);
  });

  it("flags forged sender", () => {
    const parsed = makeParsed({ from: "user@legit.com" });
    const result = scoreEmail(parsed, rawFrom(), "spammer@fake.com");
    expect(result.rules.some((r) => r.rule === "FORGED_SENDER")).toBe(true);
  });

  it("flags no-reply address", () => {
    const parsed = makeParsed({ from: "no-reply@example.com" });
    const result = scoreEmail(parsed, rawFrom(), "no-reply@example.com");
    expect(result.rules.some((r) => r.rule === "FROM_NO_REPLY")).toBe(true);
  });

  it("returns spam verdict for highly suspicious email", () => {
    const parsed = makeParsed({
      subject: "FREE WINNER!!!",
      text: "Buy cheap viagra pills now! Send wire transfer to nigerian prince bank account for million dollars",
      html: "",
      from: "spammer@evil.com",
      headers: {
        "message-id": "",
        "dkim-signature": "",
        date: "",
        received: "",
      },
    });
    const result = scoreEmail(parsed, rawFrom(), "different@domain.com");
    expect(result.verdict).toBe("spam");
    expect(result.score).toBeGreaterThanOrEqual(6);
  });

  it("includes suggestions for triggered rules", () => {
    const parsed = makeParsed({
      text: "",
      html: "<h1>HTML only</h1>",
      headers: { "dkim-signature": "" },
    });
    const result = scoreEmail(parsed, rawFrom());
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("rounds score to one decimal", () => {
    const parsed = makeParsed({});
    const result = scoreEmail(parsed, rawFrom());
    expect(result.score).toBe(Math.round(result.score * 10) / 10);
  });
});
