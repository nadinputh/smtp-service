<script setup lang="ts">
// Accessible tab list with manual activation: arrow keys move focus between
// tabs, Enter/Space (a click) activates, so passing over a lazy-loading tab
// doesn't fire its request. Panels are TabPanel components, which share the
// `${idPrefix}-panel-${key}` ids.
import type { BadgeTone } from "~/composables/badgeTones";

interface Tab {
  key: string;
  label: string;
  badge?: string | number | null;
  /** Spoken in place of the badge, e.g. "3 attachments"; the badge itself is then hidden from assistive tech. */
  badgeLabel?: string;
  badgeTone?: BadgeTone;
}

const props = defineProps<{
  tabs: Tab[];
  modelValue: string;
  label: string;
  idPrefix: string;
}>();
const emit = defineEmits<{ "update:modelValue": [key: string] }>();

const listRef = ref<HTMLElement | null>(null);
const focusKey = ref(props.modelValue);
watch(
  () => props.modelValue,
  (k) => (focusKey.value = k),
);

function focusTab(key: string) {
  focusKey.value = key;
  nextTick(() =>
    listRef.value
      ?.querySelector<HTMLElement>(`#${props.idPrefix}-tab-${key}`)
      ?.focus(),
  );
}

function onKeydown(e: KeyboardEvent) {
  const keys = props.tabs.map((t) => t.key);
  const i = keys.indexOf(focusKey.value);
  let next = -1;
  if (e.key === "ArrowRight") next = (i + 1) % keys.length;
  else if (e.key === "ArrowLeft") next = (i - 1 + keys.length) % keys.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = keys.length - 1;
  if (next === -1) return;
  e.preventDefault();
  focusTab(keys[next]);
}
</script>

<template>
  <div
    class="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700 px-6 bg-white dark:bg-gray-800 overflow-x-auto"
  >
    <div
      ref="listRef"
      role="tablist"
      :aria-label="label"
      class="flex gap-4 -mb-px w-max min-w-full"
      @keydown="onKeydown"
    >
      <button
        v-for="tab in tabs"
        :id="`${idPrefix}-tab-${tab.key}`"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="modelValue === tab.key"
        :aria-controls="`${idPrefix}-panel-${tab.key}`"
        :tabindex="focusKey === tab.key ? 0 : -1"
        class="py-3 text-sm border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset"
        :class="
          modelValue === tab.key
            ? 'border-indigo-600 dark:border-indigo-400 text-indigo-700 dark:text-indigo-300 font-medium'
            : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
        "
        @click="emit('update:modelValue', tab.key)"
      >
        {{ tab.label }}
        <Badge
          v-if="
            tab.badge !== undefined && tab.badge !== null && tab.badge !== ''
          "
          :tone="tab.badgeTone ?? 'neutral'"
          class="tabular-nums"
        >
          <span :aria-hidden="tab.badgeLabel ? 'true' : undefined">{{
            tab.badge
          }}</span>
          <span v-if="tab.badgeLabel" class="sr-only">{{
            tab.badgeLabel
          }}</span>
        </Badge>
      </button>
    </div>
  </div>
</template>
