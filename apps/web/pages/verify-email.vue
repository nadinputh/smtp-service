<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"
  >
    <div class="w-full max-w-sm">
      <div
        class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center space-y-4"
      >
        <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Email verification
        </h1>
        <p
          v-if="state === 'verifying'"
          role="status"
          class="text-sm text-gray-600 dark:text-gray-300"
        >
          Confirming your email address…
        </p>
        <p
          v-else-if="state === 'done'"
          role="status"
          class="text-sm text-green-700 dark:text-green-300"
        >
          Your email address is confirmed.
        </p>
        <p v-else role="alert" class="text-sm text-red-600 dark:text-red-400">
          {{ error }}
        </p>
        <NuxtLink
          :to="isAuthenticated ? '/' : '/login'"
          class="inline-block text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium"
        >
          {{ isAuthenticated ? "Continue" : "Sign in" }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false });
useHead({ title: "Verify Email" });

const { verifyEmail, isAuthenticated } = useAuth();
const route = useRoute();

const state = ref<"verifying" | "done" | "error">("verifying");
const error = ref("");

onMounted(async () => {
  const raw = route.query.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (typeof token !== "string" || !token) {
    state.value = "error";
    error.value = "This link is missing its token. Request a new one from the app.";
    return;
  }
  try {
    await verifyEmail(token);
    state.value = "done";
  } catch (e: any) {
    state.value = "error";
    error.value =
      e?.data?.error || "This verification link is invalid or has expired.";
  }
});
</script>
