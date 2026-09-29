// Shared validation/normalization for domain names and email addresses.
// Stored and compared values are always lowercase, bare addresses.

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_RE = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const LOCAL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;

/** Trimmed, lowercased domain (RFC 1035 labels, >= 2 labels) or null. */
export function normalizeDomain(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const domain = input.trim().toLowerCase();
  if (domain.length > 253) return null;
  const labels = domain.split(".");
  if (labels.length < 2) return null;
  if (!labels.every((l) => LABEL_RE.test(l))) return null;
  return TLD_RE.test(labels[labels.length - 1]) ? domain : null;
}

/**
 * Bare, lowercased address from `user@host` or `Name <user@host>`, or null
 * when the input is not a valid address.
 */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  const angle = /<([^<>]+)>$/.exec(raw);
  const addr = (angle ? angle[1] : raw).trim().toLowerCase();
  if (addr.length > 254) return null;

  const at = addr.lastIndexOf("@");
  if (at < 1 || at > 64) return null;
  const local = addr.slice(0, at);
  if (
    !LOCAL_RE.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  ) {
    return null;
  }
  return normalizeDomain(addr.slice(at + 1)) ? addr : null;
}

export interface ParsedRecipient {
  /** As supplied (may carry a display name) — used for MIME headers. */
  raw: string;
  /** Normalized bare address — used for suppression checks and delivery. */
  email: string;
}

/** Parse one or many addresses; null if any is invalid or the list is empty. */
export function parseRecipients(input: unknown): ParsedRecipient[] | null {
  const items = Array.isArray(input) ? input : [input];
  const out: ParsedRecipient[] = [];
  for (const item of items) {
    const email = normalizeEmail(item);
    if (!email) return null;
    out.push({ raw: (item as string).trim(), email });
  }
  return out.length > 0 ? out : null;
}

/** Split a comma-separated address list, ignoring commas inside quotes or <>. */
export function splitAddressList(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let angle = false;
  for (const ch of input) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "<") angle = true;
    else if (!quoted && ch === ">") angle = false;

    if (ch === "," && !quoted && !angle) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}
