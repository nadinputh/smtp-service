import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC over a tracked click link. Signed links are the only ones the click
 * endpoint will redirect to directly, so it can't be used as an open redirect.
 */
export function signTrackedLink(
  secret: string,
  messageId: string,
  url: string,
): string {
  return createHmac("sha256", secret)
    .update(`${messageId}\n${url}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyTrackedLink(
  secret: string,
  messageId: string,
  url: string,
  sig: unknown,
): boolean {
  if (typeof sig !== "string") return false;
  const expected = Buffer.from(signTrackedLink(secret, messageId, url));
  const actual = Buffer.from(sig);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
