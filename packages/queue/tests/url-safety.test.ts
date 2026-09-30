import { describe, it, expect } from "vitest";
import { isPrivateAddress, isInternalHostname } from "../src/url-safety.js";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe",
    "not-an-ip",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.32.0.1",
    "93.184.216.34",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("isInternalHostname", () => {
  it("flags localhost and internal suffixes only", () => {
    expect(isInternalHostname("localhost")).toBe(true);
    expect(isInternalHostname("api.LOCALHOST")).toBe(true);
    expect(isInternalHostname("db.internal")).toBe(true);
    expect(isInternalHostname("printer.local")).toBe(true);
    expect(isInternalHostname("example.com")).toBe(false);
    expect(isInternalHostname("notlocalhost.com")).toBe(false);
  });
});
