<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Account Settings
        </h2>
        <p class="text-sm text-gray-400 dark:text-gray-500">
          Manage your profile and security
        </p>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div class="max-w-lg space-y-8">
        <!-- Profile Info -->
        <section>
          <h3
            class="text-sm font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-3"
          >
            Profile
          </h3>
          <div
            class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-500 dark:text-gray-400"
                >Email</span
              >
              <span class="text-sm text-gray-800 dark:text-gray-200">{{
                user?.email
              }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-500 dark:text-gray-400">Name</span>
              <span class="text-sm text-gray-800 dark:text-gray-200">{{
                user?.name || "—"
              }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-500 dark:text-gray-400">Role</span>
              <span
                :class="
                  user?.role === 'admin'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                "
                class="text-xs px-2 py-0.5 rounded-full font-medium"
              >
                {{ user?.role }}
              </span>
            </div>
          </div>
        </section>

        <!-- Change Password -->
        <section>
          <h3
            class="text-sm font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-3"
          >
            Change Password
          </h3>
          <div
            class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
          >
            <form @submit.prevent="handleChangePassword" class="space-y-3">
              <div>
                <label
                  class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                >
                  Current Password <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="form.currentPassword"
                  type="password"
                  required
                  placeholder="Enter current password"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label
                  class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                >
                  New Password <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="form.newPassword"
                  type="password"
                  required
                  minlength="6"
                  placeholder="Min 6 characters"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label
                  class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                >
                  Confirm New Password <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="form.confirmPassword"
                  type="password"
                  required
                  minlength="6"
                  placeholder="Repeat new password"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <p v-if="error" class="text-sm text-red-600 dark:text-red-400">
                {{ error }}
              </p>
              <p
                v-if="success"
                class="text-sm text-green-600 dark:text-green-400"
              >
                {{ success }}
              </p>
              <div class="flex justify-end pt-1">
                <UBtn type="submit" :disabled="saving">
                  {{ saving ? "Updating..." : "Update Password" }}
                </UBtn>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "default" });
useHead({ title: "Settings" });

const api = useApi();
const { user } = useAuth();

const form = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});
const error = ref("");
const success = ref("");
const saving = ref(false);

async function handleChangePassword() {
  error.value = "";
  success.value = "";

  if (form.newPassword !== form.confirmPassword) {
    error.value = "New passwords do not match";
    return;
  }

  saving.value = true;
  try {
    await api.changePassword(form.currentPassword, form.newPassword);
    success.value = "Password updated successfully";
    form.currentPassword = "";
    form.newPassword = "";
    form.confirmPassword = "";
  } catch (e: any) {
    error.value = e?.data?.error || "Failed to change password";
  } finally {
    saving.value = false;
  }
}
</script>
