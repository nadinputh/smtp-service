<script setup lang="ts">
// A labelled address list that shows the first few and expands on demand.
const props = withDefaults(
  defineProps<{ label: string; addresses: string[]; preview?: number }>(),
  { preview: 2 },
);

const expanded = ref(false);
const shown = computed(() =>
  expanded.value ? props.addresses : props.addresses.slice(0, props.preview),
);
const hidden = computed(() => props.addresses.length - props.preview);
</script>

<template>
  <div v-if="addresses.length" class="flex items-start gap-2">
    <span class="text-gray-600 dark:text-gray-400 w-12 shrink-0 pt-0.5"
      >{{ label }}:</span
    >
    <div class="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
      <span
        v-for="addr in shown"
        :key="addr"
        class="inline-block px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-mono max-w-full break-all"
        >{{ addr }}</span
      >
      <button
        v-if="hidden > 0"
        type="button"
        :aria-expanded="expanded"
        class="text-xs text-indigo-700 dark:text-indigo-300 hover:underline py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
        @click="expanded = !expanded"
      >
        {{ expanded ? "Show fewer" : `+${hidden} more` }}
      </button>
    </div>
  </div>
</template>
