// DB-backed checks for the outbound worker. Runs only when TEST_DATABASE_URL
// points at a migrated, disposable Postgres; skipped otherwise.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  getDb,
  users,
  inboxes,
  messages,
  domains,
  suppressions,
  deliveryLogs,
} from "@mailpocket/db";
import { createStorage } from "@mailpocket/storage";
import { eq } from "drizzle-orm";
import { createOutboundProcessor, getDkimConfig } from "../src/outbound.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("outbound worker (database)", () => {
  const db = getDb(url!);
  const storage = createStorage({
    driver: "local",
    basePath: mkdtempSync(join(tmpdir(), "outbound-db-")),
    bucket: "test",
  });
  const suffix = randomUUID().slice(0, 8);
  const created: string[] = [];
  let owner: string;
  let other: string;
  let inboxId: string;

  async function makeUser(tag: string) {
    const [u] = await db
      .insert(users)
      .values({ email: `${tag}-${suffix}@worker.test` })
      .returning({ id: users.id });
    created.push(u.id);
    return u.id;
  }

  async function queueMessage(to: string[]) {
    const messageId = randomUUID();
    const rawKey = `outbound/${messageId}.eml`;
    const raw = Buffer.from(
      `From: a@example.com\r\nTo: ${to.join(", ")}\r\nSubject: t\r\n\r\nbody`,
    );
    await storage.putObject(rawKey, Readable.from(raw), raw.length);
    await db.insert(messages).values({
      id: messageId,
      inboxId,
      from: "a@example.com",
      to,
      rawKey,
      status: "queued",
    });
    return { messageId, rawKey };
  }

  const processor = createOutboundProcessor(
    { APP_MODE: "testing", TRACKING_BASE_URL: "http://localhost" } as any,
    db,
    storage,
    { publish: async () => 0 } as any,
  );

  async function run(to: string[], userId?: string) {
    const { messageId, rawKey } = await queueMessage(to);
    await processor({
      data: { messageId, userId, from: "a@example.com", to, rawKey },
      attemptsMade: 0,
    } as any);
    const [msg] = await db
      .select({ status: messages.status })
      .from(messages)
      .where(eq(messages.id, messageId));
    const logs = await db
      .select({
        recipient: deliveryLogs.recipient,
        status: deliveryLogs.status,
      })
      .from(deliveryLogs)
      .where(eq(deliveryLogs.messageId, messageId));
    return { status: msg.status, logs };
  }

  beforeAll(async () => {
    owner = await makeUser("owner");
    other = await makeUser("other");
    const [inbox] = await db
      .insert(inboxes)
      .values({
        userId: owner,
        name: "t",
        smtpUsername: `u-${suffix}`,
        smtpPassword: "x",
      })
      .returning({ id: inboxes.id });
    inboxId = inbox.id;
    await db.insert(suppressions).values({
      userId: owner,
      email: "blocked@example.com",
      reason: "manual",
    });
  });

  afterAll(async () => {
    for (const id of created) await db.delete(users).where(eq(users.id, id));
  });

  it("skips a suppressed recipient and marks the message suppressed", async () => {
    const r = await run(["Blocked@Example.com"], owner);
    expect(r.status).toBe("suppressed");
    expect(r.logs).toEqual([
      { recipient: "Blocked@Example.com", status: "suppressed" },
    ]);
  });

  it("still delivers the other recipients", async () => {
    const r = await run(["blocked@example.com", "fine@example.com"], owner);
    expect(r.status).toBe("delivered");
    expect(r.logs.map((l) => l.status).sort()).toEqual([
      "delivered",
      "suppressed",
    ]);
  });

  it("falls back to the inbox owner when the payload has no userId", async () => {
    const r = await run(["blocked@example.com"]);
    expect(r.status).toBe("suppressed");
  });

  it("does not apply another account's suppression list", async () => {
    const r = await run(["blocked@example.com"], other);
    expect(r.status).toBe("delivered");
  });

  describe("getDkimConfig", () => {
    const domain = `dkim-${suffix}.example.com`;

    beforeAll(async () => {
      await db.insert(domains).values([
        {
          userId: owner,
          domain,
          dkimPrivateKey: "KEY",
          verified: true,
        },
        // Same domain, unverified, other account: must never be picked.
        { userId: other, domain, dkimPrivateKey: "OTHER", verified: false },
      ]);
    });

    it("returns the owner's verified domain", async () => {
      expect(await getDkimConfig(db, owner, domain)).toMatchObject({
        domainName: domain,
        privateKey: "KEY",
      });
    });

    it("ignores another account's or unverified claim", async () => {
      expect(await getDkimConfig(db, other, domain)).toBeNull();
    });
  });
});
