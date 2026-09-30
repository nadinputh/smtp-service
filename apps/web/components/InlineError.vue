<script setup lang="ts">
// A recoverable failure, named, retryable and optionally dismissible.
// `block` renders a full-width bar.
defineProps<{ block?: boolean; retryable?: boolean; dismissible?: boolean }>();
defineEmits<{ retry: []; dismiss: [] }>();
</script>

<template>
  <div
    role="alert"
    class="flex flex-wrap items-center gap-2 text-sm text-red-700 dark:text-red-400"
    :class="
      block
        ? 'px-6 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900'
        : ''
    "
  >
    <Icon
      name="lucide:alert-circle"
      class="w-4 h-4 shrink-0"
      aria-hidden="true"
    />
    <span><slot /></span>
    <button
      v-if="retryable"
      type="button"
      class="underline hover:no-underline rounded inline-flex items-center min-h-8 px-2 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      @click="$emit('retry')"
    >
      Retry
    </button>
    <button
      v-if="dismissible"
      type="button"
      aria-label="Dismiss"
      class="icon-btn ml-auto !min-w-8 !min-h-8 text-red-700 dark:text-red-400"
      @click="$emit('dismiss')"
    >
      <Icon name="lucide:x" class="w-4 h-4" aria-hidden="true" />
    </button>
  </div>
</template>
