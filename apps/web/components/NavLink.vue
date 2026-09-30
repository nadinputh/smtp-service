<script setup lang="ts">
// A sidebar link; `active` is decided by the caller (exact path vs. param match).
defineProps<{ to: string; active: boolean }>();
</script>

<template>
  <NuxtLink
    :to="to"
    class="flex items-center gap-2 px-3 py-3 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800"
    :class="
      active
        ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
    "
  >
    <slot />
  </NuxtLink>
</template>
