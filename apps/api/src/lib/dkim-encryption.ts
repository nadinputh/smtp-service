import {
  domains,
  decryptSecret,
  encryptSecret,
  isEncrypted,
  type getDb,
} from "@mailpocket/db";
import { and, eq, isNotNull } from "drizzle-orm";

/** True when `key` is encrypted and `secret` can decrypt it. */
function readableWith(key: string, secret: string): boolean {
  try {
    decryptSecret(key, secret);
    return true;
  } catch {
    return false;
  }
}

/**
 * Brings every stored DKIM private key onto `secrets.current`: plaintext keys
 * (from before encryption was enabled) are encrypted, and keys encrypted with
 * `secrets.previous` (during rotation) are re-encrypted. Returns how many were
 * updated; keys readable with neither secret are left untouched.
 */
export async function encryptPlaintextDkimKeys(
  db: ReturnType<typeof getDb>,
  secrets: { current: string; previous?: string },
): Promise<number> {
  const rows = await db
    .select({ id: domains.id, key: domains.dkimPrivateKey })
    .from(domains)
    .where(isNotNull(domains.dkimPrivateKey));

  let count = 0;
  for (const { id, key } of rows) {
    if (!key || (isEncrypted(key) && readableWith(key, secrets.current))) {
      continue;
    }
    let plain: string;
    try {
      plain = decryptSecret(key, secrets.previous);
    } catch {
      continue; // encrypted with an unknown secret; can't migrate it
    }
    // Guarded on the old value so concurrent boots can't clobber each other.
    const updated = await db
      .update(domains)
      .set({ dkimPrivateKey: encryptSecret(plain, secrets.current) })
      .where(and(eq(domains.id, id), eq(domains.dkimPrivateKey, key)))
      .returning({ id: domains.id });
    count += updated.length;
  }
  return count;
}
