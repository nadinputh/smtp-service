import { describe, it, expect } from "vitest";
import { buildMime } from "../src/lib/mime.js";

describe("buildMime", () => {
  it("builds a normal message", async () => {
    const raw = (
      await buildMime({
        from: "a@example.com",
        to: "b@example.com",
        subject: "hi",
        text: "hello",
      })
    ).toString();
    expect(raw).toContain("Subject: hi");
    expect(raw).toContain("hello");
  });

  it("refuses to read local files through { path } content", async () => {
    await expect(
      buildMime({
        from: "a@example.com",
        to: "b@example.com",
        subject: "x",
        html: { path: "/etc/hosts" } as never,
      }),
    ).rejects.toThrow(/file access/i);
  });

  it("refuses to fetch URLs through { href } content", async () => {
    await expect(
      buildMime({
        from: "a@example.com",
        to: "b@example.com",
        subject: "x",
        text: { href: "http://127.0.0.1:1/secret" } as never,
      }),
    ).rejects.toThrow(/url access/i);
  });
});
