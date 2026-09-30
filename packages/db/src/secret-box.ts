import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

// Encrypts secrets stored in the database (DKIM private keys) with AES-256-GCM.
// Stored form: enc:v1:<iv>:<auth tag>:<ciphertext>, each part base64. Values
// without the prefix are legacy plaintext and pass through unchanged, so
// existing rows keep working until they are re-encrypted.
const PREFIX = "enc:v1:";

// The secret is a high-entropy random string, so one SHA-256 pass is enough
// to turn it into a 32-byte key (same reasoning as API key hashing).
const deriveKey = (secret: string) =>
  createHash("sha256").update(`mailpocket:secret-box:v1:${secret}`).digest();

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

/** Encrypts `plain`; with no secret configured it is stored as-is. */
export function encryptSecret(plain: string, secret?: string): string {
  if (!secret) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${[iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64"))
    .join(":")}`;
}

/**
 * Reverses `encryptSecret`. `secrets` are tried in order (current first, then
 * a previous one during rotation); throws if none is given, none works, or the
 * data was tampered with.
 */
export function decryptSecret(
  stored: string,
  ...secrets: (string | undefined)[]
): string {
  if (!isEncrypted(stored)) return stored;
  const candidates = secrets.filter((s): s is string => !!s);
  if (candidates.length === 0) {
    throw new Error("DKIM_ENCRYPTION_KEY is required to read encrypted keys");
  }
  const [iv, tag, data] = stored
    .slice(PREFIX.length)
    .split(":")
    .map((p) => Buffer.from(p, "base64"));
  let lastError: unknown;
  for (const secret of candidates) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString(
        "utf8",
      );
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
