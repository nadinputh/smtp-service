import { users, type getDb } from "@mailpocket/db";
import { eq } from "drizzle-orm";

export const UNVERIFIED_ACCOUNT_ERROR =
  "An unverified account already uses this email address. Verify it from the email we sent, or ask an admin to remove it.";

/**
 * Whether an OAuth2 `email_verified` claim lets us trust the address. A claim
 * that is absent only passes when the operator opted in for such providers.
 */
export function emailClaimTrusted(
  claim: unknown,
  allowUnverified: boolean,
): boolean {
  return claim === true || (claim === undefined && allowUnverified);
}

type SsoUser = { id: string; email: string; name: string | null; role: string };

/**
 * The local user for an identity an external provider (OAuth2/LDAP) has
 * vouched for, created on first sign-in. An existing account that never proved
 * its address is refused: otherwise whoever registered the address first would
 * own the account the real person later signs into.
 */
export async function resolveSsoUser(
  db: ReturnType<typeof getDb>,
  email: string,
  name: string | null,
): Promise<{ user: SsoUser } | { error: string }> {
  const columns = {
    id: users.id,
    email: users.email,
    name: users.name,
    role: users.role,
    emailVerifiedAt: users.emailVerifiedAt,
  };
  const find = () =>
    db
      .select(columns)
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
      .then(([row]) => row);

  let user = await find();
  if (!user) {
    // Insert-or-ignore then re-read: concurrent first sign-ins must not 500
    // on the unique email.
    await db
      .insert(users)
      .values({ email, name, emailVerifiedAt: new Date() })
      .onConflictDoNothing({ target: users.email });
    user = await find();
  }
  if (!user) return { error: "Could not sign in" };
  if (!user.emailVerifiedAt) return { error: UNVERIFIED_ACCOUNT_ERROR };

  const { emailVerifiedAt: _verified, ...rest } = user;
  return { user: rest };
}
