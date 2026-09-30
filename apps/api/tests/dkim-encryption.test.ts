// Needs TEST_DATABASE_URL pointing at a migrated, disposable Postgres.
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  getDb,
  users,
  domains,
  decryptSecret,
  encryptSecret,
  isEncrypted,
} from "@mailpocket/db";
import { encryptPlaintextDkimKeys } from "../src/lib/dkim-encryption.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("encryptPlaintextDkimKeys", () => {
  const db = getDb(url!);
  const secret = "s".repeat(32);
  let userId: string;

  afterAll(async () => {
    if (userId) await db.delete(users).where(eq(users.id, userId));
  });

  it("encrypts plaintext keys once and leaves encrypted ones alone", async () => {
    [{ id: userId }] = await db
      .insert(users)
      .values({ email: `dkim-${randomUUID().slice(0, 8)}@enc.test` })
      .returning({ id: users.id });
    await db.insert(domains).values({
      userId,
      domain: "plain.enc.test",
      dkimPrivateKey: "PLAIN-PEM",
    });

    expect(
      await encryptPlaintextDkimKeys(db, { current: secret }),
    ).toBeGreaterThanOrEqual(1);
    const [row] = await db
      .select({ key: domains.dkimPrivateKey })
      .from(domains)
      .where(eq(domains.userId, userId));
    expect(isEncrypted(row.key!)).toBe(true);
    expect(decryptSecret(row.key!, secret)).toBe("PLAIN-PEM");

    // Second run finds nothing left to do for this user's row.
    await encryptPlaintextDkimKeys(db, { current: secret });
    const [again] = await db
      .select({ key: domains.dkimPrivateKey })
      .from(domains)
      .where(eq(domains.userId, userId));
    expect(again.key).toBe(row.key);
  });

  it("re-encrypts keys still under the previous secret, skips unknown ones", async () => {
    const previous = "p".repeat(32);
    await db.insert(domains).values([
      {
        userId,
        domain: "old.enc.test",
        dkimPrivateKey: encryptSecret("OLD-PEM", previous),
      },
      {
        userId,
        domain: "alien.enc.test",
        dkimPrivateKey: encryptSecret("ALIEN", "z".repeat(32)),
      },
    ]);
    await encryptPlaintextDkimKeys(db, { current: secret, previous });
    const rows = await db
      .select({ domain: domains.domain, key: domains.dkimPrivateKey })
      .from(domains)
      .where(eq(domains.userId, userId));
    const byDomain = Object.fromEntries(rows.map((r) => [r.domain, r.key!]));
    expect(decryptSecret(byDomain["old.enc.test"], secret)).toBe("OLD-PEM");
    expect(() => decryptSecret(byDomain["alien.enc.test"], secret)).toThrow();
  });
});
