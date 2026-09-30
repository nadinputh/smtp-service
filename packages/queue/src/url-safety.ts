import { BlockList, isIP } from "node:net";

const blocked = new BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(addr, prefix, "ipv6");
}

/** IPv4 embedded in an IPv4-mapped IPv6 address (::ffff:a.b.c.d or ::ffff:hhhh:hhhh). */
function mappedIPv4(ip: string): string | null {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** True for loopback, private, link-local, multicast, and unparseable addresses. */
export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (!family) return true;
  if (family === 6) {
    const v4 = mappedIPv4(ip);
    if (v4) return blocked.check(v4, "ipv4");
  }
  return blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/** Hostname as URL.hostname reports it, without IPv6 brackets. */
export function bareHost(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

/** Hostnames that resolve internally regardless of DNS. */
export function isInternalHostname(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  );
}
