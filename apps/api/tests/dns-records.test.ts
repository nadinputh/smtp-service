import { describe, it, expect } from "vitest";
import {
  dnsRecordsFor,
  hasSpfRecord,
  spfAuthorizes,
} from "../src/lib/dns-records.js";

const d = {
  domain: "example.com",
  dkimSelector: "smtp1",
  dkimPublicKey: "PUB",
};

describe("dnsRecordsFor", () => {
  it("builds the DKIM record and a placeholder SPF without SENDING_IP", () => {
    const r = dnsRecordsFor(d);
    expect(r.dkim).toEqual({
      type: "TXT",
      name: "smtp1._domainkey.example.com",
      value: "v=DKIM1; k=rsa; p=PUB",
    });
    expect(r.spf.value).toBe("v=spf1 ip4:<YOUR_SERVER_IP> -all");
    expect(r.spf.note).toBeDefined();
  });

  it("publishes the configured IPv4 or IPv6 address", () => {
    expect(dnsRecordsFor(d, "203.0.113.5").spf).toMatchObject({
      value: "v=spf1 ip4:203.0.113.5 -all",
    });
    expect(dnsRecordsFor(d, "203.0.113.5").spf.note).toBeUndefined();
    expect(dnsRecordsFor(d, "2001:db8::1").spf.value).toBe(
      "v=spf1 ip6:2001:db8::1 -all",
    );
  });
});

describe("SPF checks", () => {
  const records = [
    ["google-site-verification=x"],
    ["v=spf1 ip4:203.0.113.5 ~all"],
  ];

  it("finds an SPF record among other TXT records", () => {
    expect(hasSpfRecord(records)).toBe(true);
    expect(hasSpfRecord([["hello"]])).toBe(false);
  });

  it("requires the exact ip mechanism, not a prefix of another address", () => {
    expect(spfAuthorizes(records, "203.0.113.5")).toBe(true);
    expect(spfAuthorizes(records, "203.0.113.50")).toBe(false);
    expect(spfAuthorizes([["ip4:203.0.113.5"]], "203.0.113.5")).toBe(false);
  });

  it("joins a record split across TXT strings", () => {
    expect(
      spfAuthorizes([["v=spf1 ip4:203.0.", "113.5 -all"]], "203.0.113.5"),
    ).toBe(true);
  });
});
