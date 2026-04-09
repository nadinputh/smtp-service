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
            Create account
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Start capturing emails in minutes
          </p>
        </div>

        <form @submit.prevent="handleRegister" class="space-y-4">
          <div>
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Name</label
            >
            <input
              v-model="name"
              type="text"
              autocomplete="name"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="John Doe"
            />
          </div>
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
              minlength="8"
              autocomplete="new-password"
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
            {{ loading ? "Creating account..." : "Create account" }}
          </button>
        </form>

        <p class="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?
          <NuxtLink
            to="/login"
            class="text-indigo-600 hover:text-indigo-500 font-medium"
          >
            Sign in
          </NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false });

const { register, isAuthenticated } = useAuth();

if (isAuthenticated.value) {
  navigateTo("/");
}

const name = ref("");
const email = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

async function handleRegister() {
  error.value = "";
  loading.value = true;
  try {
    await register(email.value, password.value, name.value || undefined);
    navigateTo("/");
  } catch (e: any) {
    error.value = e?.data?.error || "Registration failed";
  } finally {
    loading.value = false;
  }
}
</script>
