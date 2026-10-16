import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { postJson } from "../src/webhook-dispatcher.js";

let server: http.Server;
let port: number;
let received: { headers: http.IncomingHttpHeaders; body: string } | null = null;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received = { headers: req.headers, body };
      if (req.url === "/redirect") {
        res.writeHead(302, { Location: "http://127.0.0.1:1/" }).end();
      } else if (req.url === "/big") {
        res.writeHead(200).end("x".repeat(200_000));
      } else {
        res.writeHead(200).end("ok");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise((r) => server.close(r)));

describe("postJson", () => {
  it("delivers headers and body when private targets are allowed", async () => {
    const res = await postJson(
      `http://127.0.0.1:${port}/`,
      '{"a":1}',
      { "Content-Type": "application/json", "X-Test": "1" },
      false,
    );
    expect(res).toEqual({ status: 200, body: "ok" });
    expect(received?.headers["x-test"]).toBe("1");
    expect(received?.body).toBe('{"a":1}');
  });

  it("refuses loopback literals and internal names in public-only mode", async () => {
    await expect(
      postJson(`http://127.0.0.1:${port}/`, "{}", {}, true),
    ).rejects.toThrow(/not a public host/);
    await expect(
      postJson(`http://localhost:${port}/`, "{}", {}, true),
    ).rejects.toThrow(/not a public host/);
    await expect(
      postJson(`http://[::1]:${port}/`, "{}", {}, true),
    ).rejects.toThrow(/not a public host/);
  });

  it("refuses a public-looking name that resolves to a private address", async () => {
    // *.localtest.me-style names resolve to 127.0.0.1; the pinned lookup must
    // reject them even though the hostname itself isn't "internal".
    await expect(
      postJson(`http://127.0.0.1.nip.io:${port}/`, "{}", {}, true),
    ).rejects.toThrow();
  });

  it("does not follow redirects", async () => {
    const res = await postJson(
      `http://127.0.0.1:${port}/redirect`,
      "{}",
      {},
      false,
    );
    expect(res.status).toBe(302);
  });

  it("caps how much of the response it reads", async () => {
    const res = await postJson(`http://127.0.0.1:${port}/big`, "{}", {}, false);
    expect(res.body.length).toBeLessThanOrEqual(64 * 1024);
  });
});
