<script setup lang="ts">
defineProps<{
  count: number;
  pageSize: number;
  canSelectAllMatching: boolean;
  allMatching: boolean;
  matchingTotal: number;
  matchingReachable: number;
  selectingAll: boolean;
  canDelete: boolean;
}>();
defineEmits<{
  "select-page": [];
  "select-all": [];
  read: [isRead: boolean];
  delete: [];
  clear: [];
}>();
</script>

<template>
  <div
    role="toolbar"
    aria-label="Bulk actions"
    class="px-6 py-2 border-b border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 flex flex-wrap items-center gap-2 shrink-0"
  >
    <span
      class="text-sm font-medium text-indigo-900 dark:text-indigo-200"
      aria-live="polite"
      >{{ count }} selected</span
    >
    <UBtn variant="ghost" size="xs" @click="$emit('select-page')"
      >Select page ({{ pageSize }})</UBtn
    >
    <UBtn
      v-if="canSelectAllMatching"
      variant="ghost"
      size="xs"
      :loading="selectingAll"
      @click="$emit('select-all')"
      >{{
        matchingReachable < matchingTotal
          ? `Select first ${matchingReachable.toLocaleString()} of ${matchingTotal.toLocaleString()} matching`
          : `Select all ${matchingTotal.toLocaleString()} matching`
      }}</UBtn
    >
    <UBtn variant="secondary" size="xs" @click="$emit('read', true)"
      >Mark read</UBtn
    >
    <UBtn variant="secondary" size="xs" @click="$emit('read', false)"
      >Mark unread</UBtn
    >
    <UBtn
      v-if="canDelete"
      variant="danger"
      size="xs"
      icon="lucide:trash-2"
      @click="$emit('delete')"
      >Delete</UBtn
    >
    <UBtn variant="ghost" size="xs" class="ml-auto" @click="$emit('clear')"
      >Clear selection</UBtn
    >
  </div>
</template>
