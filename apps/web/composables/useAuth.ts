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

export function useAuth() {
  // Hydrate from localStorage on first call (client-side only)
  if (import.meta.client && !authState.token) {
    const saved = localStorage.getItem("auth");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        authState.token = parsed.token;
        authState.user = parsed.user;
      } catch {
        localStorage.removeItem("auth");
      }
    }
  }

  function persist() {
    if (import.meta.client) {
      localStorage.setItem(
        "auth",
        JSON.stringify({ token: authState.token, user: authState.user }),
      );
    }
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

  async function loginOAuth2() {
    const res = await $fetch<{
      authorizeUrl: string;
      codeVerifier: string;
      state: string;
    }>("/api/auth/oauth2/authorize");

    // Store PKCE verifier for the callback
    if (import.meta.client) {
      sessionStorage.setItem("oauth2_code_verifier", res.codeVerifier);
      sessionStorage.setItem("oauth2_state", res.state);
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

  function logout() {
    authState.token = null;
    authState.user = null;
    if (import.meta.client) {
      localStorage.removeItem("auth");
    }
    navigateTo("/login");
  }

  const isAuthenticated = computed(() => !!authState.token);

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
    logout,
  };
}
