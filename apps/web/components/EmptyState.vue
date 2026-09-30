<script setup lang="ts">
withDefaults(
  defineProps<{ icon?: string; title: string; compact?: boolean }>(),
  { icon: "lucide:inbox", compact: false },
);
</script>

<template>
  <div
    class="text-center text-gray-600 dark:text-gray-400"
    :class="compact ? 'py-6' : 'py-12 px-6'"
  >
    <Icon
      :name="icon"
      class="mx-auto mb-3 opacity-60"
      :class="compact ? 'w-8 h-8' : 'w-12 h-12'"
      aria-hidden="true"
    />
    <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
      {{ title }}
    </p>
    <p v-if="$slots.default" class="text-sm mt-1"><slot /></p>
    <div v-if="$slots.action" class="mt-4"><slot name="action" /></div>
  </div>
</template>
