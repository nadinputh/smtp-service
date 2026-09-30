interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

interface AuthProviders {
  local: boolean;
  ldap: boolean;
  oauth2: boolean;
}

interface AuthState {
  token: string | null;
  user: User | null;
  providers: AuthProviders | null;
}

const authState = reactive<AuthState>({
  token: null,
  user: null,
  providers: null,
});

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

// Where to send a user whose session just ended without them asking —
// carries them back to where they were, and lets login.vue explain why
// they're suddenly looking at a sign-in form again.
//
// Uses the app-relative route path (via useRoute()), NOT window.location —
// this app is served under a configurable app.baseURL (e.g. /admin/smtp),
// which window.location.pathname would include and Nuxt's navigateTo()
// would then prepend a second time.
function buildForcedLoginUrl(reason: string): string {
  const here = useRoute().fullPath;
  const isAuthPath =
    here.startsWith("/login") ||
    here.startsWith("/register") ||
    here.startsWith("/auth/");
  const params = new URLSearchParams({ reason });
  if (!isAuthPath) params.set("redirect", here);
  return `/login?${params.toString()}`;
}

let _visibilityListenerAdded = false;
let _storageListenerAdded = false;

export function useAuth() {
  // Hydrate from localStorage on first call (client-side only)
  if (import.meta.client && !authState.token) {
    const saved = localStorage.getItem("auth");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.token && !isTokenExpired(parsed.token)) {
          authState.token = parsed.token;
          authState.user = parsed.user;
        } else {
          localStorage.removeItem("auth");
        }
      } catch {
        localStorage.removeItem("auth");
      }
    }
  }

  // Detect expired sessions when the user switches back to the tab
  if (import.meta.client && !_visibilityListenerAdded) {
    _visibilityListenerAdded = true;
    document.addEventListener("visibilitychange", () => {
      if (
        !document.hidden &&
        authState.token &&
        isTokenExpired(authState.token)
      ) {
        forceLogout("expired");
      }
    });
  }

  // Keep sibling tabs in sync: a logout/forceLogout in one tab shouldn't
  // leave another tab quietly rendering authenticated UI until its next
  // request happens to 401.
  if (import.meta.client && !_storageListenerAdded) {
    _storageListenerAdded = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== "auth") return;

      if (!event.newValue) {
        // Cleared in another tab.
        if (authState.token) forceLogout("expired");
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue);
        if (parsed.token && !isTokenExpired(parsed.token)) {
          authState.token = parsed.token;
          authState.user = parsed.user;
        }
      } catch {
        // Ignore malformed cross-tab payloads.
      }
    });
  }

  function persist() {
    if (import.meta.client) {
      localStorage.setItem(
        "auth",
        JSON.stringify({ token: authState.token, user: authState.user }),
      );
    }
  }

  // Swap in a refreshed token (e.g. after a password change ends old sessions)
  function setToken(token: string) {
    authState.token = token;
    persist();
  }

  async function fetchProviders(): Promise<AuthProviders> {
    if (authState.providers) return authState.providers;
    const res = await $fetch<AuthProviders>("/api/auth/providers");
    authState.providers = res;
    return res;
  }

  async function login(email: string, password: string) {
    const res = await $fetch<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    authState.token = res.token;
    authState.user = res.user;
    persist();
    return res;
  }

  async function loginLdap(username: string, password: string) {
    const res = await $fetch<{ token: string; user: User }>("/api/auth/ldap", {
      method: "POST",
      body: { username, password },
    });
    authState.token = res.token;
    authState.user = res.user;
    persist();
    return res;
  }

  async function loginOAuth2(redirectTarget?: string | null) {
    // Generate PKCE verifier on the client — never send it to the server
    const codeVerifier = crypto
      .getRandomValues(new Uint8Array(32))
      .reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");

    const codeChallenge = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(codeVerifier))
      .then((buf) =>
        btoa(String.fromCharCode(...new Uint8Array(buf)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=/g, ""),
      );

    const res = await $fetch<{ authorizeUrl: string; state: string }>(
      `/api/auth/oauth2/authorize?codeChallenge=${encodeURIComponent(codeChallenge)}`,
    );

    // Store PKCE verifier and state for the callback
    if (import.meta.client) {
      sessionStorage.setItem("oauth2_code_verifier", codeVerifier);
      sessionStorage.setItem("oauth2_state", res.state);
      if (redirectTarget) {
        sessionStorage.setItem("oauth2_redirect", redirectTarget);
      }
    }

    // Redirect to OAuth2 provider
    if (import.meta.client) {
      window.location.href = res.authorizeUrl;
    }
  }

  async function handleOAuth2Callback(code: string, state: string) {
    if (import.meta.client) {
      const savedState = sessionStorage.getItem("oauth2_state");
      if (state !== savedState) {
        throw new Error("Invalid OAuth2 state parameter");
      }

      const codeVerifier = sessionStorage.getItem("oauth2_code_verifier");
      if (!codeVerifier) {
        throw new Error("Missing PKCE code verifier");
      }

      const res = await $fetch<{ token: string; user: User }>(
        "/api/auth/oauth2/callback",
        {
          method: "POST",
          body: { code, codeVerifier },
        },
      );

      // Clean up
      sessionStorage.removeItem("oauth2_code_verifier");
      sessionStorage.removeItem("oauth2_state");

      authState.token = res.token;
      authState.user = res.user;
      persist();
      return res;
    }
  }

  async function register(email: string, password: string, name?: string) {
    const res = await $fetch<{ token: string; user: User }>(
      "/api/auth/register",
      {
        method: "POST",
        body: { email, password, name },
      },
    );
    authState.token = res.token;
    authState.user = res.user;
    persist();
    return res;
  }

  async function forgotPassword(email: string) {
    return await $fetch<{ message: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: { email },
    });
  }

  async function resetPassword(token: string, newPassword: string) {
    return await $fetch<{ success: boolean }>("/api/auth/reset-password", {
      method: "POST",
      body: { token, newPassword },
    });
  }

  function logout() {
    authState.token = null;
    authState.user = null;
    if (import.meta.client) {
      localStorage.removeItem("auth");
    }
    navigateTo("/login");
  }

  // Like logout(), but for when the session ends without the user asking —
  // expiry or a 401 from the API. Tells login.vue why, and where to return
  // the user once they've signed back in.
  function forceLogout(reason: string) {
    authState.token = null;
    authState.user = null;
    if (import.meta.client) {
      localStorage.removeItem("auth");
      navigateTo(buildForcedLoginUrl(reason));
    }
  }

  const isAuthenticated = computed(
    () => !!authState.token && !isTokenExpired(authState.token),
  );

  return {
    token: computed(() => authState.token),
    user: computed(() => authState.user),
    providers: computed(() => authState.providers),
    isAuthenticated,
    fetchProviders,
    login,
    loginLdap,
    loginOAuth2,
    handleOAuth2Callback,
    register,
    forgotPassword,
    resetPassword,
    logout,
    forceLogout,
    setToken,
  };
}
