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
            class="w-10 h-10 text-indigo-600 mx-auto mb-2"
          />
          <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">
            Sign in
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Access your SMTP inboxes
          </p>
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
                ? 'border-indigo-600 text-indigo-600'
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
                ? 'border-indigo-600 text-indigo-600'
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
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Email</label
            >
            <input
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Password</label
            >
            <input
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

          <button
            type="submit"
            :disabled="loading"
            class="w-full py-2 px-4 bg-indigo-600 text-white font-medium rounded-lg text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
          >
            {{ loading ? "Signing in..." : "Sign in" }}
          </button>
        </form>

        <!-- LDAP login form -->
        <form
          v-if="authMethod === 'ldap'"
          @submit.prevent="handleLdapLogin"
          class="space-y-4"
        >
          <div>
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Username</label
            >
            <input
              v-model="ldapUsername"
              type="text"
              required
              autocomplete="username"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="jdoe"
            />
          </div>
          <div>
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Password</label
            >
            <input
              v-model="ldapPassword"
              type="password"
              required
              autocomplete="current-password"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

          <button
            type="submit"
            :disabled="loading"
            class="w-full py-2 px-4 bg-indigo-600 text-white font-medium rounded-lg text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
          >
            {{ loading ? "Signing in..." : "Sign in with LDAP" }}
          </button>
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

          <button
            :disabled="loading"
            class="w-full py-2 px-4 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            @click="handleOAuth2"
          >
            <Icon name="lucide:shield" class="w-4 h-4" />
            {{ loading ? "Redirecting..." : "Sign in with SSO" }}
          </button>
        </div>

        <p
          v-if="providers?.local"
          class="mt-4 text-center text-sm text-gray-500 dark:text-gray-400"
        >
          Don't have an account?
          <NuxtLink
            to="/register"
            class="text-indigo-600 hover:text-indigo-500 font-medium"
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

const { login, loginLdap, loginOAuth2, fetchProviders, isAuthenticated } =
  useAuth();

// Redirect if already logged in
if (isAuthenticated.value) {
  navigateTo("/");
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
    navigateTo("/");
  } catch (e: any) {
    error.value = e?.data?.error || "Login failed";
  } finally {
    loading.value = false;
  }
}

async function handleLdapLogin() {
  error.value = "";
  loading.value = true;
  try {
    await loginLdap(ldapUsername.value, ldapPassword.value);
    navigateTo("/");
  } catch (e: any) {
    error.value = e?.data?.error || "LDAP login failed";
  } finally {
    loading.value = false;
  }
}

async function handleOAuth2() {
  error.value = "";
  loading.value = true;
  try {
    await loginOAuth2();
  } catch (e: any) {
    error.value = e?.data?.error || "OAuth2 login failed";
    loading.value = false;
  }
}
</script>
