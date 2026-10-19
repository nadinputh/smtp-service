import { createHmac, timingSafeEqual } from "node:crypto";

/** What an open-tracking pixel signs, in place of a click URL. */
export const OPEN_PIXEL_TARGET = "open";

/**
 * HMAC over a tracked click link. Signed links are the only ones the click
 * endpoint will redirect to directly, so it can't be used as an open redirect.
 */
export function signTrackedLink(
  secret: string,
  messageId: string,
  url: string,
): string {
  return hmac(trackingKey(secret), messageId, url);
}

/** Domain-separated key, so link signatures never use the raw session secret. */
function trackingKey(secret: string): string {
  return createHmac("sha256", secret).update("mailpocket:tracking:v1").digest("hex");
}

const hmac = (key: string, messageId: string, url: string) =>
  createHmac("sha256", key)
    .update(`${messageId}\n${url}`)
    .digest("hex")
    .slice(0, 32);

export function verifyTrackedLink(
  secret: string,
  messageId: string,
  url: string,
  sig: unknown,
): boolean {
  if (typeof sig !== "string") return false;
  const actual = Buffer.from(sig);
  // Links in mail sent before key separation were signed with the raw secret
  // and must keep redirecting.
  return [signTrackedLink(secret, messageId, url), hmac(secret, messageId, url)]
    .map((candidate) => Buffer.from(candidate))
    .some(
      (expected) =>
        actual.length === expected.length && timingSafeEqual(actual, expected),
    );
}
