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
            name="lucide:key-round"
            class="w-10 h-10 text-indigo-600 dark:text-indigo-400 mx-auto mb-2"
          />
          <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">
            Choose a new password
          </h1>
        </div>

        <div v-if="!token" role="alert" class="space-y-4 text-center">
          <div
            class="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 text-sm text-red-800 dark:text-red-300 text-left"
          >
            <Icon name="lucide:alert-circle" class="w-4 h-4 shrink-0 mt-0.5" />
            <span>This reset link is missing its token. Please request a new one.</span>
          </div>
          <NuxtLink
            to="/forgot-password"
            class="inline-block text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium"
          >
            Request a new link
          </NuxtLink>
        </div>

        <div v-else-if="done" role="status" class="space-y-4 text-center">
          <div
            class="flex items-start gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-3 py-2.5 text-sm text-green-800 dark:text-green-300 text-left"
          >
            <Icon name="lucide:check-circle-2" class="w-4 h-4 shrink-0 mt-0.5" />
            <span>Your password has been reset. You can now sign in.</span>
          </div>
          <NuxtLink
            to="/login"
            class="inline-block text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium"
          >
            Sign in
          </NuxtLink>
        </div>

        <form v-else @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label
              for="reset-password"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >New password</label
            >
            <PasswordInput
              id="reset-password"
              v-model="password"
              required
              minlength="8"
              autocomplete="new-password"
            />
            <PasswordChecklist :password="password" />
          </div>
          <div>
            <label
              for="reset-confirm-password"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Confirm new password</label
            >
            <PasswordInput
              id="reset-confirm-password"
              v-model="confirmPassword"
              required
              minlength="8"
              autocomplete="new-password"
            />
          </div>

          <p v-if="error" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

          <UBtn type="submit" :disabled="loading" class="w-full">
            {{ loading ? "Resetting..." : "Reset password" }}
          </UBtn>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false });
useHead({ title: "Reset Password" });

const { resetPassword, isAuthenticated } = useAuth();
const route = useRoute();

if (isAuthenticated.value) {
  await navigateTo("/");
}

const token = computed(() => {
  const raw = route.query.token;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : "";
});

const password = ref("");
const confirmPassword = ref("");
const error = ref("");
const loading = ref(false);
const done = ref(false);

async function handleSubmit() {
  error.value = "";

  if (password.value !== confirmPassword.value) {
    error.value = "Passwords do not match";
    return;
  }

  loading.value = true;
  try {
    await resetPassword(token.value, password.value);
    done.value = true;
  } catch (e: any) {
    error.value = e?.data?.error || "Failed to reset password";
  } finally {
    loading.value = false;
  }
}
</script>
