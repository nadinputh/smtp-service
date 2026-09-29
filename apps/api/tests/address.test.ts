import { describe, it, expect } from "vitest";
import {
  normalizeDomain,
  normalizeEmail,
  parseRecipients,
  splitAddressList,
} from "../src/lib/address.js";

describe("normalizeDomain", () => {
  it.each([
    "example.com",
    "x.com",
    "t.co",
    "sub.example.co.uk",
    "xn--mnchen-3ya.de",
  ])("accepts %s", (d) => expect(normalizeDomain(d)).toBe(d));

  it("trims and lowercases", () => {
    expect(normalizeDomain("  Example.COM ")).toBe("example.com");
  });

  it.each([
    "a..b.com",
    "-a.com",
    "a-.com",
    "a.-b.com",
    "localhost",
    "foo.com.",
    "foo.c",
    "foo.123",
    "münchen.de",
    `${"a".repeat(64)}.com`,
    `${"a.".repeat(130)}com`,
    "",
  ])("rejects %j", (d) => expect(normalizeDomain(d)).toBeNull());

  it("rejects non-strings", () => {
    expect(normalizeDomain(undefined)).toBeNull();
    expect(normalizeDomain(["a.com"])).toBeNull();
    expect(normalizeDomain(42)).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Blocked@Example.COM ")).toBe(
      "blocked@example.com",
    );
  });

  it("extracts the address from a display-name form", () => {
    expect(normalizeEmail("Bob <Bob@Example.com>")).toBe("bob@example.com");
  });

  it.each([
    "",
    "   ",
    "plain",
    "@example.com",
    "a@",
    "a@localhost",
    "a b@example.com",
    "a..b@example.com",
    ".a@example.com",
    "a@exa mple.com",
    `${"a".repeat(65)}@example.com`,
    `a@${"b".repeat(250)}.com`,
  ])("rejects %j", (e) => expect(normalizeEmail(e)).toBeNull());

  it("rejects non-strings", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail({})).toBeNull();
  });
});

describe("parseRecipients", () => {
  it("keeps raw for headers and normalizes for matching", () => {
    expect(parseRecipients(["Bob <Bob@Example.com>", "c@example.com"])).toEqual(
      [
        { raw: "Bob <Bob@Example.com>", email: "bob@example.com" },
        { raw: "c@example.com", email: "c@example.com" },
      ],
    );
  });

  it("accepts a single string", () => {
    expect(parseRecipients("a@example.com")).toHaveLength(1);
  });

  it("returns null for empty lists or any invalid entry", () => {
    expect(parseRecipients([])).toBeNull();
    expect(parseRecipients(["a@example.com", "nope"])).toBeNull();
  });
});

describe("splitAddressList", () => {
  it("splits plain lists and trims", () => {
    expect(splitAddressList("a@example.com, b@example.com ")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("keeps commas inside quoted display names and angle brackets", () => {
    expect(
      splitAddressList('"Doe, John" <j@example.com>, k@example.com'),
    ).toEqual(['"Doe, John" <j@example.com>', "k@example.com"]);
  });

  it("drops empty entries", () => {
    expect(splitAddressList(" , ,")).toEqual([]);
  });
});
