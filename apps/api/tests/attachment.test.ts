import { describe, it, expect } from "vitest";
import { attachmentHeaders } from "../src/lib/attachment.js";

describe("attachmentHeaders", () => {
  it("serves inert types inline", () => {
    const h = attachmentHeaders("pic.png", "image/PNG");
    expect(h["Content-Disposition"]).toMatch(/^inline;/);
    expect(h["Content-Type"]).toBe("image/PNG");
  });

  it.each([
    "text/html",
    "image/svg+xml",
    "application/xhtml+xml",
    "application/javascript",
    "text/xml",
    "",
  ])("forces download and neutral type for %j", (type) => {
    const h = attachmentHeaders("x", type);
    expect(h["Content-Disposition"]).toMatch(/^attachment;/);
    expect(h["Content-Type"]).toBe("application/octet-stream");
  });

  it("always sets nosniff and a sandbox CSP", () => {
    const h = attachmentHeaders("x", "image/png");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Security-Policy"]).toContain("sandbox");
  });

  it("neutralizes quotes, control chars and non-ASCII in filenames", () => {
    const h = attachmentHeaders("evil\"\r\n\u00e9'.html", "text/html");
    expect(h["Content-Disposition"]).not.toMatch(/[\r\n]/);
    expect(h["Content-Disposition"]).toContain('filename="evil____');
    expect(h["Content-Disposition"]).toContain("%27");
    expect(attachmentHeaders("", "image/png")["Content-Disposition"]).toContain(
      'filename="attachment"',
    );
  });
});
