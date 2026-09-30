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
  encryptSecret,
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

  it("does not re-deliver to recipients that already succeeded (retry)", async () => {
    const to = ["retry-a@example.com", "retry-b@example.com"];
    const { messageId, rawKey } = await queueMessage(to);
    // First attempt already delivered "a" before the job was retried.
    await db.insert(deliveryLogs).values({
      messageId,
      recipient: to[0],
      status: "delivered",
    });
    await processor({
      data: { messageId, userId: owner, from: "a@example.com", to, rawKey },
      attemptsMade: 1,
    } as any);
    const logs = await db
      .select({
        recipient: deliveryLogs.recipient,
        status: deliveryLogs.status,
      })
      .from(deliveryLogs)
      .where(eq(deliveryLogs.messageId, messageId));
    expect(logs.filter((l) => l.recipient === to[0])).toHaveLength(1);
    expect(logs.filter((l) => l.recipient === to[1])).toHaveLength(1);
  });

  describe("production sender-domain enforcement", () => {
    const verifiedDomain = `prod-${suffix}.example.com`;
    const prodProcessor = createOutboundProcessor(
      { APP_MODE: "production", TRACKING_BASE_URL: "http://localhost" } as any,
      db,
      storage,
      { publish: async () => 0 } as any,
    );

    beforeAll(async () => {
      await db.insert(domains).values({
        userId: owner,
        domain: verifiedDomain,
        dkimPrivateKey: "KEY",
        verified: true,
      });
    });

    it("bounces (no retry) when the sender domain is not verified", async () => {
      const { messageId, rawKey } = await queueMessage(["r@example.com"]);
      // Permanent failure: resolves instead of throwing, so BullMQ won't retry.
      await prodProcessor({
        data: {
          messageId,
          userId: owner,
          from: "a@unverified.example.net",
          to: ["r@example.com"],
          rawKey,
          requireVerifiedSender: true,
        },
        attemptsMade: 0,
      } as any);
      const [msg] = await db
        .select({ status: messages.status })
        .from(messages)
        .where(eq(messages.id, messageId));
      const [log] = await db
        .select({
          status: deliveryLogs.status,
          smtpCode: deliveryLogs.smtpCode,
          response: deliveryLogs.smtpResponse,
        })
        .from(deliveryLogs)
        .where(eq(deliveryLogs.messageId, messageId));
      expect(msg.status).toBe("bounced");
      expect(log).toMatchObject({ status: "bounced", smtpCode: 550 });
      expect(log.response).toContain("not verified");
    });

    it("leaves server-originated mail (no flag) alone", async () => {
      const { messageId, rawKey } = await queueMessage([
        "r@nonexistent.invalid",
      ]);
      // Reaches the real delivery attempt instead of the 550 sender bounce.
      await prodProcessor({
        data: {
          messageId,
          from: "noreply@mailpocket.local",
          to: ["r@nonexistent.invalid"],
          rawKey,
        },
        attemptsMade: 0,
      } as any).catch(() => {});
      const [log] = await db
        .select({ smtpCode: deliveryLogs.smtpCode })
        .from(deliveryLogs)
        .where(eq(deliveryLogs.messageId, messageId));
      expect(log.smtpCode).not.toBe(550);
    });

    it("bounces when only another account has verified the domain", async () => {
      const { messageId, rawKey } = await queueMessage(["r@example.com"]);
      await prodProcessor({
        data: {
          messageId,
          userId: other,
          from: `a@${verifiedDomain}`,
          to: ["r@example.com"],
          rawKey,
          requireVerifiedSender: true,
        },
        attemptsMade: 0,
      } as any);
      const [msg] = await db
        .select({ status: messages.status })
        .from(messages)
        .where(eq(messages.id, messageId));
      expect(msg.status).toBe("bounced");
    });
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
      expect(await getDkimConfig(db, domain, { ownerId: owner })).toMatchObject(
        { domainName: domain, privateKey: "KEY" },
      );
    });

    it("ignores another account's or unverified claim", async () => {
      expect(await getDkimConfig(db, domain, { ownerId: other })).toBeNull();
    });

    it("without an owner uses whichever account verified the domain", async () => {
      expect((await getDkimConfig(db, domain))?.privateKey).toBe("KEY");
    });

    it("covers a subdomain via the nearest verified parent", async () => {
      const cfg = await getDkimConfig(db, `mail.eu.${domain}`, {
        ownerId: owner,
      });
      expect(cfg?.domainName).toBe(domain);
      expect(
        await getDkimConfig(db, `mail.eu.${domain}`, { ownerId: other }),
      ).toBeNull();
    });

    it("prefers a more specific verified subdomain over the parent", async () => {
      const sub = `special.${domain}`;
      await db.insert(domains).values({
        userId: other,
        domain: sub,
        dkimPrivateKey: "SUBKEY",
        verified: true,
      });
      // The parent's owner is not covered once another account verified the subdomain.
      expect(await getDkimConfig(db, sub, { ownerId: owner })).toBeNull();
      expect(
        (await getDkimConfig(db, sub, { ownerId: other }))?.privateKey,
      ).toBe("SUBKEY");
    });

    it("decrypts with the current or previous secret, and refuses without", async () => {
      const current = "c".repeat(32);
      const previous = "p".repeat(32);
      const encDomain = `enc-${suffix}.example.com`;
      await db.insert(domains).values({
        userId: owner,
        domain: encDomain,
        dkimPrivateKey: encryptSecret("PEM-BODY", previous),
        verified: true,
      });
      const cfg = await getDkimConfig(db, encDomain, {
        ownerId: owner,
        secrets: [current, previous],
      });
      expect(cfg?.privateKey).toBe("PEM-BODY");
      await expect(
        getDkimConfig(db, encDomain, { ownerId: owner }),
      ).rejects.toThrow(/DKIM_ENCRYPTION_KEY/);
    });
  });
});
