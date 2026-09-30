import { describe, it, expect } from "vitest";
import { injectTracking } from "../src/tracking.js";
import { verifyTrackedLink } from "@mailpocket/queue";

const BASE_URL = "http://localhost:3002";
const MSG_ID = "test-msg-123";

describe("injectTracking", () => {
  it("rewrites <a href> links for click tracking", () => {
    const html = `<html><body><a href="https://example.com">Click</a></body></html>`;
    const result = injectTracking(html, MSG_ID, BASE_URL);

    expect(result).toContain(
      `href="${BASE_URL}/t/click/${MSG_ID}?url=${encodeURIComponent("https://example.com")}"`,
    );
    expect(result).not.toContain('href="https://example.com"');
  });

  it("skips mailto: links", () => {
    const html = `<a href="mailto:test@test.com">Email</a>`;
    const result = injectTracking(html, MSG_ID, BASE_URL);
    expect(result).toContain('href="mailto:test@test.com"');
  });

  it("skips tel: links", () => {
    const html = `<a href="tel:+1234567890">Call</a>`;
    const result = injectTracking(html, MSG_ID, BASE_URL);
    expect(result).toContain('href="tel:+1234567890"');
  });

  it("skips anchor links", () => {
    const html = `<a href="#section">Jump</a>`;
    const result = injectTracking(html, MSG_ID, BASE_URL);
    expect(result).toContain('href="#section"');
  });

  it("injects open tracking pixel before </body>", () => {
    const html = `<html><body><p>Hello</p></body></html>`;
    const result = injectTracking(html, MSG_ID, BASE_URL);

    expect(result).toContain(`src="${BASE_URL}/t/open/${MSG_ID}"`);
    expect(result).toContain('width="1" height="1"');
    expect(result).toMatch(/style="display:none".*<\/body>/);
  });

  it("appends pixel when no </body> tag exists", () => {
    const html = `<p>No body tag</p>`;
    const result = injectTracking(html, MSG_ID, BASE_URL);

    expect(result).toContain(`src="${BASE_URL}/t/open/${MSG_ID}"`);
  });

  it("handles multiple links", () => {
    const html = `<a href="https://a.com">A</a><a href="https://b.com">B</a>`;
    const result = injectTracking(html, MSG_ID, BASE_URL);

    expect(result).toContain(`url=${encodeURIComponent("https://a.com")}`);
    expect(result).toContain(`url=${encodeURIComponent("https://b.com")}`);
  });

  it("handles empty HTML gracefully", () => {
    const result = injectTracking("", MSG_ID, BASE_URL);
    expect(result).toContain(`/t/open/${MSG_ID}`);
  });
});

describe("injectTracking signing", () => {
  it("adds a verifiable signature to each rewritten link when a secret is given", () => {
    const secret = "test-secret-test-secret";
    const out = injectTracking(
      '<a href="https://example.com/x?a=1&b=2">go</a>',
      MSG_ID,
      BASE_URL,
      secret,
    );
    const href = /href="([^"]+)"/.exec(out)![1];
    const parsed = new URL(href.replace(/&amp;/g, "&"));
    expect(
      verifyTrackedLink(
        secret,
        MSG_ID,
        parsed.searchParams.get("url")!,
        parsed.searchParams.get("sig"),
      ),
    ).toBe(true);
  });

  it("stays unsigned when no secret is provided", () => {
    const out = injectTracking('<a href="https://example.com">go</a>', MSG_ID, BASE_URL);
    expect(out).not.toContain("sig=");
  });
});
