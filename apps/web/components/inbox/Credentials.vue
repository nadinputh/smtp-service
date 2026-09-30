<script setup lang="ts">
// SMTP connection details as a disclosure under the header (not a modal).
defineProps<{
  host: string;
  port: string | number;
  username: string;
  /** Read-only viewers aren't sent the SMTP password. */
  password?: string;
}>();
defineEmits<{ close: [] }>();
const showPassword = ref(false);
</script>

<template>
  <section
    id="smtp-creds"
    aria-label="SMTP credentials"
    class="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-sm space-y-2 shrink-0"
  >
    <div class="flex items-center justify-between">
      <h2
        class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
      >
        SMTP Settings
      </h2>
      <button
        type="button"
        class="icon-btn -my-2"
        aria-label="Hide SMTP credentials"
        @click="$emit('close')"
      >
        <Icon name="lucide:x" class="w-4 h-4" />
      </button>
    </div>
    <dl class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1">
      <dt class="text-gray-600 dark:text-gray-400">Host</dt>
      <dd>
        <code class="text-gray-800 dark:text-gray-200">{{ host }}</code>
      </dd>
      <dt class="text-gray-600 dark:text-gray-400">Port</dt>
      <dd>
        <code class="text-gray-800 dark:text-gray-200">{{ port }}</code>
      </dd>
      <dt class="text-gray-600 dark:text-gray-400">Username</dt>
      <dd class="flex items-center gap-1">
        <code class="text-gray-800 dark:text-gray-200">{{ username }}</code>
        <CopyButton :text="username" label="username" />
      </dd>
      <template v-if="password">
        <dt class="text-gray-600 dark:text-gray-400">Password</dt>
        <dd class="flex items-center gap-1">
          <code class="text-gray-800 dark:text-gray-200">{{
            showPassword ? password : "••••••••••••"
          }}</code>
          <button
            type="button"
            class="icon-btn"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
            :aria-pressed="showPassword"
            @click="showPassword = !showPassword"
          >
            <Icon
              :name="showPassword ? 'lucide:eye-off' : 'lucide:eye'"
              class="w-4 h-4"
            />
          </button>
          <CopyButton :text="password" label="password" />
        </dd>
      </template>
    </dl>
  </section>
</template>
