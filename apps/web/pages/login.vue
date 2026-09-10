<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"
  >
    <div class="w-full max-w-sm">
      <div
        class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8"
      >
        <div class="text-center mb-6">
          <Icon
            name="lucide:mail"
            class="w-10 h-10 text-indigo-600 dark:text-indigo-400 mx-auto mb-2"
          />
          <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">
            Welcome back
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sign in to your MailPocket inboxes
          </p>
        </div>

        <div
          v-if="showExpiredBanner"
          role="status"
          class="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2.5 text-sm text-blue-800 dark:text-blue-300"
        >
          <Icon name="lucide:clock" class="w-4 h-4 shrink-0 mt-0.5" />
          <span
            >Your session timed out. Sign back in and we'll take you right
            back to where you left off.</span
          >
        </div>

        <!-- Auth method tabs -->
        <div
          v-if="showTabs"
          class="flex border-b border-gray-200 dark:border-gray-700 mb-4"
        >
          <button
            v-if="providers?.local"
            :class="[
              'flex-1 py-2 text-sm font-medium border-b-2 transition-colors',
              authMethod === 'local'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
            ]"
            @click="authMethod = 'local'"
          >
            Email
          </button>
          <button
            v-if="providers?.ldap"
            :class="[
              'flex-1 py-2 text-sm font-medium border-b-2 transition-colors',
              authMethod === 'ldap'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
            ]"
            @click="authMethod = 'ldap'"
          >
            LDAP
          </button>
        </div>

        <!-- Local login form -->
        <form
          v-if="authMethod === 'local'"
          @submit.prevent="handleLogin"
          class="space-y-4"
        >
          <div>
            <label
              for="login-email"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Email</label
            >
            <input
              id="login-email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <label
                for="login-password"
                class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >Password</label
              >
              <NuxtLink
                to="/forgot-password"
                class="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium"
              >
                Forgot password?
              </NuxtLink>
            </div>
            <PasswordInput
              id="login-password"
              v-model="password"
              required
              autocomplete="current-password"
            />
          </div>

          <p v-if="error" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

          <UBtn type="submit" :disabled="loading" class="w-full">
            {{ loading ? "Signing in..." : "Sign in" }}
          </UBtn>
        </form>

        <!-- LDAP login form -->
        <form
          v-if="authMethod === 'ldap'"
          @submit.prevent="handleLdapLogin"
          class="space-y-4"
        >
          <div>
            <label
              for="login-ldap-username"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Username</label
            >
            <input
              id="login-ldap-username"
              v-model="ldapUsername"
              type="text"
              required
              autocomplete="username"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="jdoe"
            />
          </div>
          <div>
            <label
              for="login-ldap-password"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Password</label
            >
            <PasswordInput
              id="login-ldap-password"
              v-model="ldapPassword"
              required
              autocomplete="current-password"
            />
          </div>

          <p v-if="error" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

          <UBtn type="submit" :disabled="loading" class="w-full">
            {{ loading ? "Signing in..." : "Sign in with LDAP" }}
          </UBtn>
        </form>

        <!-- OAuth2 button -->
        <div v-if="providers?.oauth2" class="mt-4">
          <div v-if="providers?.local || providers?.ldap" class="relative my-4">
            <div class="absolute inset-0 flex items-center">
              <div
                class="w-full border-t border-gray-200 dark:border-gray-700"
              />
            </div>
            <div class="relative flex justify-center text-sm">
              <span
                class="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                >or</span
              >
            </div>
          </div>

          <UBtn
            variant="secondary"
            :disabled="loading"
            class="w-full"
            @click="handleOAuth2"
          >
            <Icon name="lucide:shield" class="w-4 h-4" />
            {{ loading ? "Redirecting..." : "Sign in with SSO" }}
          </UBtn>
        </div>

        <p
          v-if="providers?.local"
          class="mt-4 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          Don't have an account?
          <NuxtLink
            to="/register"
            class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium"
          >
            Register
          </NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false });
useHead({ title: "Sign In" });

const { login, loginLdap, loginOAuth2, fetchProviders, isAuthenticated } =
  useAuth();
const route = useRoute();

// Where to send the user after a successful sign-in. Only ever a same-app
// relative path — never trust the query string with an off-site redirect,
// and never bounce back into the auth pages themselves.
function safeRedirectTarget(): string | null {
  const raw = route.query.redirect;
  const target = Array.isArray(raw) ? raw[0] : raw;
  if (!target || typeof target !== "string") return null;
  if (!target.startsWith("/") || target.startsWith("//")) return null;
  if (target.startsWith("/login") || target.startsWith("/register"))
    return null;
  return target;
}

const showExpiredBanner = route.query.reason === "expired";

// Redirect if already logged in
if (isAuthenticated.value) {
  await navigateTo(safeRedirectTarget() ?? "/");
}

const email = ref("");
const password = ref("");
const ldapUsername = ref("");
const ldapPassword = ref("");
const error = ref("");
const loading = ref(false);
const authMethod = ref<"local" | "ldap">("local");

const providers = ref<{
  local: boolean;
  ldap: boolean;
  oauth2: boolean;
} | null>(null);

// Fetch available providers
onMounted(async () => {
  try {
    providers.value = await fetchProviders();
    // Default to first available method
    if (!providers.value.local && providers.value.ldap) {
      authMethod.value = "ldap";
    }
  } catch {
    // Default to local if providers endpoint fails
    providers.value = { local: true, ldap: false, oauth2: false };
  }
});

const showTabs = computed(() => {
  if (!providers.value) return false;
  const count =
    (providers.value.local ? 1 : 0) + (providers.value.ldap ? 1 : 0);
  return count > 1;
});

async function handleLogin() {
  error.value = "";
  loading.value = true;
  try {
    await login(email.value, password.value);
    await navigateTo(safeRedirectTarget() ?? "/", { replace: true });
  } catch (e: any) {
    error.value = e?.data?.error || "Login failed";
    loading.value = false;
  }
}

async function handleLdapLogin() {
  error.value = "";
  loading.value = true;
  try {
    await loginLdap(ldapUsername.value, ldapPassword.value);
    await navigateTo(safeRedirectTarget() ?? "/", { replace: true });
  } catch (e: any) {
    error.value = e?.data?.error || "LDAP login failed";
    loading.value = false;
  }
}

async function handleOAuth2() {
  error.value = "";
  loading.value = true;
  try {
    await loginOAuth2(safeRedirectTarget());
  } catch (e: any) {
    error.value = e?.data?.error || "OAuth2 login failed";
    loading.value = false;
  }
}
</script>
