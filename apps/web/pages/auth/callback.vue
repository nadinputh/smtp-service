<template>
  <div
    class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"
  >
    <div class="w-full max-w-sm">
      <div
        class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center"
      >
        <div v-if="loading" class="space-y-4">
          <Icon
            name="lucide:loader-2"
            class="w-10 h-10 text-indigo-600 mx-auto animate-spin"
          />
          <p class="text-sm text-gray-600 dark:text-gray-300">
            Completing sign in...
          </p>
        </div>
        <div v-else-if="error" class="space-y-4">
          <Icon
            name="lucide:alert-circle"
            class="w-10 h-10 text-red-500 mx-auto"
          />
          <p class="text-sm text-red-600">{{ error }}</p>
          <NuxtLink
            to="/login"
            class="inline-block mt-2 text-sm text-indigo-600 hover:text-indigo-500 font-medium"
          >
            Back to login
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: false });

const { handleOAuth2Callback } = useAuth();
const route = useRoute();

const loading = ref(true);
const error = ref("");

onMounted(async () => {
  const code = route.query.code as string;
  const state = route.query.state as string;

  if (!code || !state) {
    error.value = "Missing authorization code or state";
    loading.value = false;
    return;
  }

  try {
    await handleOAuth2Callback(code, state);
    navigateTo("/");
  } catch (e: any) {
    error.value = e?.data?.error || e?.message || "Authentication failed";
  } finally {
    loading.value = false;
  }
});
</script>
