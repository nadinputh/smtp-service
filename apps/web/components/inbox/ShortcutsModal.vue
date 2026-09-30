<script setup lang="ts">
defineProps<{ scope: "list" | "message" }>();
defineEmits<{ close: [] }>();
const enabled = useShortcutsEnabled();

const LIST = [
  ["j / k", "Next / previous message"],
  ["Enter", "Open the focused message"],
  ["x", "Select or deselect the focused message"],
  ["Shift I / Shift U", "Mark the selection read / unread"],
  ["#", "Delete the selection"],
  ["/", "Search"],
  ["?", "Show this help"],
];
const MESSAGE = [
  ["] / [", "Next / previous message"],
  ["u", "Back to the list"],
  ["?", "Show this help"],
];
</script>

<template>
  <Modal title="Keyboard shortcuts" @close="$emit('close')">
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <template
        v-for="[keys, what] in scope === 'list' ? LIST : MESSAGE"
        :key="keys"
      >
        <dt>
          <kbd
            class="px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-500 bg-gray-50 dark:bg-gray-700 text-xs font-mono text-gray-800 dark:text-gray-200"
            >{{ keys }}</kbd
          >
        </dt>
        <dd class="text-gray-700 dark:text-gray-300">{{ what }}</dd>
      </template>
    </dl>
    <label
      class="mt-4 flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200"
    >
      <input
        v-model="enabled"
        type="checkbox"
        class="w-4 h-4 rounded border-gray-500 dark:border-gray-400 text-indigo-600 focus:ring-indigo-500"
      />
      Enable single-key shortcuts
    </label>
    <p class="mt-2 text-xs text-gray-600 dark:text-gray-400">
      Shortcuts pause while you're typing in a field or a dialog is open.
    </p>
  </Modal>
</template>
