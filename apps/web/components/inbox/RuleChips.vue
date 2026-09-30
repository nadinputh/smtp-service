<script setup lang="ts">
// Saved filters (rules) as a row of toggle chips.
type Rule = {
  id: string;
  name: string;
  color: string | null;
  total?: number;
  unreadTotal: number;
};

defineProps<{
  rules: Rule[];
  activeId: string | null;
  canEdit: boolean;
}>();
defineEmits<{ select: [id: string | null]; edit: [rule: Rule]; new: [] }>();
</script>

<template>
  <div
    role="group"
    aria-label="Saved filters"
    class="px-4 py-2 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center gap-1.5 overflow-x-auto shrink-0"
  >
    <button
      type="button"
      :aria-pressed="!activeId"
      class="chip"
      :class="
        !activeId
          ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-transparent'
          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
      "
      @click="$emit('select', null)"
    >
      All messages
    </button>
    <div
      v-for="rule in rules"
      :key="rule.id"
      class="flex items-center shrink-0 group"
    >
      <button
        type="button"
        :aria-pressed="activeId === rule.id"
        class="chip"
        :class="
          activeId === rule.id
            ? ruleColor(rule.color).active
            : ruleColor(rule.color).inactive
        "
        :title="`${rule.total ?? 0} messages, ${rule.unreadTotal} unread`"
        @click="$emit('select', rule.id)"
      >
        <span
          class="w-2 h-2 rounded-full shrink-0"
          :class="ruleColor(rule.color).dot"
          aria-hidden="true"
        />
        {{ rule.name }}
        <Badge
          tone="neutral"
          class="tabular-nums"
          :class="rule.unreadTotal > 0 ? 'font-semibold' : ''"
        >
          <span class="sr-only"
            >{{ rule.total ?? 0 }} messages, {{ rule.unreadTotal }} unread</span
          >
          <span aria-hidden="true">{{ rule.total ?? 0 }}</span>
        </Badge>
      </button>
      <!-- Always visible on touch and keyboard focus; hover-reveal only where a pointer exists -->
      <button
        v-if="canEdit"
        type="button"
        :aria-label="`Edit filter ${rule.name}`"
        class="icon-btn lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100 transition-opacity"
        @click="$emit('edit', rule)"
      >
        <Icon name="lucide:pencil" class="w-4 h-4" />
      </button>
    </div>
    <button
      v-if="canEdit"
      type="button"
      class="chip border-dashed border-gray-400 dark:border-gray-500 text-gray-700 dark:text-gray-300 hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"
      @click="$emit('new')"
    >
      <Icon name="lucide:plus" class="w-3.5 h-3.5" />
      New filter
    </button>
  </div>
</template>
