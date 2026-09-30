<script setup lang="ts">
// Search, status views and the date filters for the message list.
const search = defineModel<string>("search", { required: true });
const status = defineModel<string>("status", { required: true });
const after = defineModel<string>("after", { required: true });
const before = defineModel<string>("before", { required: true });

defineProps<{
  attentionTotal: number;
  hasActiveFilters: boolean;
}>();
defineEmits<{ clear: [] }>();

// Open when a filter is active that the status chips can't show
const showFilters = ref(
  !!(after.value || before.value) ||
    !STATUS_VIEWS.some((v) => v.value === status.value),
);
const inputRef = ref<HTMLInputElement | null>(null);
defineExpose({ focusSearch: () => inputRef.value?.focus() });
</script>

<template>
  <div
    class="px-6 py-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-2 shrink-0"
  >
    <div class="flex items-center gap-2">
      <div class="relative flex-1">
        <Icon
          name="lucide:search"
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-400 pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref="inputRef"
          v-model="search"
          type="search"
          aria-label="Search messages"
          placeholder="Search by subject, from, or to…  ( / )"
          class="field pl-9"
        />
      </div>
      <button
        type="button"
        aria-controls="message-filters"
        :aria-expanded="showFilters"
        class="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg transition-colors min-h-10"
        :class="
          after || before
            ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
            : 'border-gray-400 dark:border-gray-500 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
        "
        @click="showFilters = !showFilters"
      >
        <Icon name="lucide:filter" class="w-4 h-4" />
        Filters
      </button>
      <button
        v-if="hasActiveFilters"
        type="button"
        class="px-3 py-2 text-sm min-h-10 text-red-700 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
        @click="$emit('clear')"
      >
        Clear
      </button>
    </div>

    <!-- Status views appear once there's something to triage (or a status is active) -->
    <div
      v-if="attentionTotal > 0 || status"
      role="group"
      aria-label="Status"
      class="flex items-center gap-1.5 overflow-x-auto"
    >
      <button
        v-for="view in STATUS_VIEWS"
        :key="view.value"
        type="button"
        :aria-pressed="status === view.value"
        class="chip"
        :class="
          status === view.value
            ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-transparent'
            : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
        "
        @click="status = view.value"
      >
        {{ view.label }}
        <Badge
          v-if="view.value === 'bounced,failed' && attentionTotal > 0"
          tone="danger"
          class="tabular-nums"
          >{{ attentionTotal }}</Badge
        >
      </button>
    </div>

    <div v-if="showFilters" id="message-filters" class="flex flex-wrap gap-2">
      <select
        v-model="status"
        aria-label="Filter by status"
        class="field w-auto"
      >
        <option value="">All statuses</option>
        <optgroup label="Views">
          <option
            v-for="v in STATUS_VIEWS.filter((s) => s.value.includes(','))"
            :key="v.value"
            :value="v.value"
          >
            {{ v.label }}
          </option>
        </optgroup>
        <optgroup label="Exact status">
          <option
            v-for="s in MESSAGE_STATUS_OPTIONS"
            :key="s.value"
            :value="s.value"
          >
            {{ s.label }}
          </option>
        </optgroup>
      </select>
      <input
        v-model="after"
        type="date"
        aria-label="Received on or after"
        class="field w-auto"
      />
      <input
        v-model="before"
        type="date"
        aria-label="Received on or before"
        class="field w-auto"
      />
    </div>
  </div>
</template>
