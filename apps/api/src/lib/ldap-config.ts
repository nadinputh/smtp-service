import type { getEnv } from "@mailpocket/env";

type Env = ReturnType<typeof getEnv>;

/**
 * LDAP_ENABLED alone doesn't mean LDAP login will actually work — the four
 * connection/search settings below are also required. Checked in one place
 * so the provider-availability endpoint and the login endpoint can never
 * disagree about whether LDAP is really usable.
 */
export function isLdapConfigured(env: Env): boolean {
  return !!(
    env.LDAP_ENABLED &&
    env.LDAP_URL &&
    env.LDAP_BIND_DN &&
    env.LDAP_BIND_PASSWORD &&
    env.LDAP_SEARCH_BASE
  );
}
