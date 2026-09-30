import { findVerifiedSenderDomain, type getDb } from "@mailpocket/db";
import { normalizeEmail } from "./address.js";

/**
 * Production relay only sends as a domain the account has verified, or a
 * subdomain of one (nearest verified domain wins, so another account's
 * verified subdomain is never covered by this account's parent). Returns the
 * error to report, or null when the send may proceed. Testing mode never
 * relays, so it is not restricted.
 */
export async function senderDomainError(
  db: ReturnType<typeof getDb>,
  mode: "testing" | "production",
  userId: string,
  from: string,
): Promise<string | null> {
  if (mode !== "production") return null;
  const sender = normalizeEmail(from);
  if (!sender) return null; // malformed `from` is rejected by the caller's own validation
  const domain = sender.slice(sender.lastIndexOf("@") + 1);

  const covering = await findVerifiedSenderDomain(db, domain);
  return covering?.userId === userId
    ? null
    : `Sender domain ${domain} is not verified for this account. Add and verify it under Domains before sending from it.`;
}
