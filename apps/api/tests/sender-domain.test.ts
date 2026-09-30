import { describe, it, expect } from "vitest";
import { senderDomainError } from "../src/lib/sender-domain.js";

/** Minimal drizzle stand-in: every select chain resolves to `rows`. */
function dbReturning(rows: unknown[]) {
  let queries = 0;
  const chain: any = {
    from: () => chain,
    where: () => {
      queries++;
      return Promise.resolve(rows);
    },
  };
  return { db: { select: () => chain } as any, queries: () => queries };
}

const row = (userId: string, domain = "example.com") => ({
  domain,
  userId,
  selector: "smtp1",
  privateKey: "k",
});

describe("senderDomainError", () => {
  it("never restricts testing mode (and skips the lookup)", async () => {
    const { db, queries } = dbReturning([]);
    expect(await senderDomainError(db, "testing", "u", "a@x.com")).toBeNull();
    expect(queries()).toBe(0);
  });

  it("blocks production sends from a domain with no verified match", async () => {
    const { db } = dbReturning([]);
    const err = await senderDomainError(
      db,
      "production",
      "u",
      "Ann <Ann@Example.COM>",
    );
    expect(err).toContain("example.com");
    expect(err).toContain("not verified");
  });

  it("allows production sends from the account's verified domain", async () => {
    const { db } = dbReturning([row("u")]);
    expect(
      await senderDomainError(db, "production", "u", "a@example.com"),
    ).toBeNull();
  });

  it("allows a subdomain of the account's verified domain", async () => {
    const { db } = dbReturning([row("u")]);
    expect(
      await senderDomainError(db, "production", "u", "a@mail.example.com"),
    ).toBeNull();
  });

  it("blocks when the covering verified domain belongs to another account", async () => {
    const { db } = dbReturning([row("someone-else")]);
    expect(
      await senderDomainError(db, "production", "u", "a@example.com"),
    ).toContain("not verified");
  });

  it("uses the nearest verified domain: another account's subdomain wins over my parent", async () => {
    const { db } = dbReturning([
      row("u", "example.com"),
      row("other", "mail.example.com"),
    ]);
    expect(
      await senderDomainError(db, "production", "u", "a@mail.example.com"),
    ).toContain("not verified");
  });

  it("leaves a malformed from to the route's own validation", async () => {
    const { db } = dbReturning([]);
    expect(await senderDomainError(db, "production", "u", "nope")).toBeNull();
  });
});
