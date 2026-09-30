import { isIP } from "node:net";

export interface DnsRecords {
  dkim: { type: "TXT"; name: string; value: string };
  spf: { type: "TXT"; name: string; value: string; note?: string };
}

/** The TXT records a domain must publish. Shared by every domains response. */
export function dnsRecordsFor(
  d: { domain: string; dkimSelector: string; dkimPublicKey: string | null },
  sendingIp?: string,
): DnsRecords {
  const mechanism = sendingIp
    ? `${isIP(sendingIp) === 6 ? "ip6" : "ip4"}:${sendingIp}`
    : "ip4:<YOUR_SERVER_IP>";
  return {
    dkim: {
      type: "TXT",
      name: `${d.dkimSelector}._domainkey.${d.domain}`,
      value: `v=DKIM1; k=rsa; p=${d.dkimPublicKey ?? ""}`,
    },
    spf: {
      type: "TXT",
      name: d.domain,
      value: `v=spf1 ${mechanism} -all`,
      ...(sendingIp
        ? {}
        : {
            note: "Replace <YOUR_SERVER_IP> with your server's public IP address (or set SENDING_IP on the server)",
          }),
    },
  };
}

/** True if a TXT-record set holds an SPF record that authorizes `ip`. */
export function spfAuthorizes(records: string[][], ip: string): boolean {
  const mech = `${isIP(ip) === 6 ? "ip6" : "ip4"}:${ip.toLowerCase()}`;
  return records.some((parts) => {
    const txt = parts.join("").toLowerCase();
    return txt.startsWith("v=spf1") && txt.split(/\s+/).some((t) => t === mech);
  });
}

export function hasSpfRecord(records: string[][]): boolean {
  return records.some((p) => p.join("").toLowerCase().startsWith("v=spf1"));
}
