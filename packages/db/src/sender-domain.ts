import { and, inArray, eq } from "drizzle-orm";
import { domains } from "./schema/index.js";
import type { getDb } from "./index.js";

/** `a.b.example.com` -> [a.b.example.com, b.example.com, example.com]. */
export function domainAndParents(domain: string): string[] {
  const labels = domain.split(".");
  const out: string[] = [];
  for (let i = 0; i <= labels.length - 2; i++) {
    out.push(labels.slice(i).join("."));
  }
  return out;
}

/**
 * The verified domain that covers `senderDomain`: the sender's own domain, or
 * its closest verified parent. Nearest wins, so a subdomain verified by one
 * account is never covered by another account's verified parent.
 */
export async function findVerifiedSenderDomain(
  db: ReturnType<typeof getDb>,
  senderDomain: string,
) {
  const rows = await db
    .select({
      domain: domains.domain,
      userId: domains.userId,
      selector: domains.dkimSelector,
      privateKey: domains.dkimPrivateKey,
    })
    .from(domains)
    .where(
      and(
        eq(domains.verified, true),
        inArray(domains.domain, domainAndParents(senderDomain)),
      ),
    );
  // Longer name = more specific.
  rows.sort((a, b) => b.domain.length - a.domain.length);
  return rows[0] ?? null;
}
