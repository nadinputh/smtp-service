import { decryptSecret, encryptSecret } from "@mailpocket/db";
import type { Env } from "@mailpocket/env";

type KeyEnv = Pick<Env, "DKIM_ENCRYPTION_KEY" | "DKIM_ENCRYPTION_KEY_PREVIOUS">;

/** Inbox SMTP passwords are encrypted at rest when an encryption key is set. */
export const sealSmtpPassword = (plain: string, env: KeyEnv) =>
  encryptSecret(plain, env.DKIM_ENCRYPTION_KEY);

export const revealSmtpPassword = (stored: string, env: KeyEnv) =>
  decryptSecret(
    stored,
    env.DKIM_ENCRYPTION_KEY,
    env.DKIM_ENCRYPTION_KEY_PREVIOUS,
  );
