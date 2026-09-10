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
            Reset your password
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            We'll email you a link to get back in
          </p>
        </div>

        <div
          v-if="sent"
          role="status"
          class="text-center space-y-4"
        >
          <div
            class="flex items-start gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-3 py-2.5 text-sm text-green-800 dark:text-green-300 text-left"
          >
            <Icon name="lucide:mail-check" class="w-4 h-4 shrink-0 mt-0.5" />
            <span
              >If an account exists for <strong>{{ email }}</strong>, we've
              sent a password reset link. It expires in 1 hour.</span
            >
          </div>
          <NuxtLink
            to="/login"
            class="inline-block text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium"
          >
            Back to sign in
          </NuxtLink>
        </div>

        <form v-else @submit.prevent="handleSubmit" class="space-y-4">
          <div>
            <label
              for="forgot-email"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Email</label
            >
            <input
              id="forgot-email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          <p v-if="error" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>

          <UBtn type="submit" :disabled="loading" class="w-full">
            {{ loading ? "Sending..." : "Send reset link" }}
          </UBtn>

          <p class="text-center text-sm text-gray-500 dark:text-gray-400">
            <NuxtLink
              to="/login"
              class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium"
            >
              Back to sign in
            </NuxtLink>
          </p>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false });
useHead({ title: "Reset Password" });

const { forgotPassword, isAuthenticated } = useAuth();

if (isAuthenticated.value) {
  await navigateTo("/");
}

const email = ref("");
const error = ref("");
const loading = ref(false);
const sent = ref(false);

async function handleSubmit() {
  error.value = "";
  loading.value = true;
  try {
    await forgotPassword(email.value);
    sent.value = true;
  } catch (e: any) {
    error.value = e?.data?.error || "Something went wrong. Please try again.";
  } finally {
    loading.value = false;
  }
}
</script>
