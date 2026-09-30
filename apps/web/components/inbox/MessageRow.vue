<script setup lang="ts">
import type { PaginatedMessages } from "~/composables/useApi";

type Msg = PaginatedMessages["messages"][number];

const props = defineProps<{
  msg: Msg;
  to: { path: string; query: Record<string, string> };
  selected: boolean;
  toggling: boolean;
  /** The one row that's in the tab order; arrow keys move it (roving tabindex). */
  active: boolean;
}>();
defineEmits<{
  focus: [];
  check: [event: MouseEvent];
  open: [];
  "toggle-read": [];
}>();

const date = computed(() => (props.msg.date || props.msg.createdAt) as string);
const recipients = computed(() => {
  const to = props.msg.to;
  if (!to.length) return "(none)";
  if (to.length <= 2) return to.join(", ");
  return `${to[0]}, ${to[1]} +${to.length - 2} more`;
});
const spam = computed(() => spamVerdict(props.msg.spamScore));
const subject = computed(() => props.msg.subject || "(no subject)");
</script>

<template>
  <li class="relative" :data-id="msg.id" @focusin="$emit('focus')">
    <label
      class="absolute left-0 top-0 w-12 h-12 flex items-center justify-center cursor-pointer z-[1]"
    >
      <input
        type="checkbox"
        class="w-4 h-4 rounded border-gray-500 dark:border-gray-400 text-indigo-600 focus:ring-indigo-500"
        :checked="selected"
        :tabindex="active ? 0 : -1"
        :aria-label="`Select ${msg.subject || 'message with no subject'}`"
        @click="$emit('check', $event)"
      />
    </label>
    <NuxtLink
      :to="to"
      :tabindex="active ? 0 : -1"
      class="block pl-12 pr-14 py-3 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
      :class="[
        !msg.isRead ? 'bg-indigo-50/60 dark:bg-indigo-900/10' : '',
        selected ? '!bg-indigo-100/70 dark:!bg-indigo-900/30' : '',
      ]"
      @click="$emit('open')"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <template v-if="!msg.isRead">
            <span
              class="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0"
              aria-hidden="true"
            />
            <span class="sr-only">Unread.</span>
          </template>
          <span
            class="text-sm truncate"
            :class="
              msg.isRead
                ? 'text-gray-700 dark:text-gray-400'
                : 'font-semibold text-gray-900 dark:text-gray-100'
            "
            >{{ msg.from }}</span
          >
          <span
            class="text-xs text-gray-600 dark:text-gray-400 truncate hidden sm:inline"
            >to {{ recipients }}</span
          >
        </div>
        <time
          :datetime="date"
          :title="formatFullDate(date)"
          class="text-xs text-gray-600 dark:text-gray-400 shrink-0"
          >{{ formatDateTime(date) }}</time
        >
      </div>
      <div class="flex items-center gap-2 mt-0.5 min-w-0">
        <p
          class="text-sm truncate min-w-0 flex-1"
          :class="
            msg.isRead
              ? 'text-gray-600 dark:text-gray-400'
              : 'font-medium text-gray-800 dark:text-gray-200'
          "
        >
          {{ subject }}
        </p>
        <span
          v-if="msg.attachmentCount > 0"
          class="inline-flex items-center gap-0.5 text-xs text-gray-700 dark:text-gray-300 shrink-0"
          :title="`${msg.attachmentCount} attachment${msg.attachmentCount === 1 ? '' : 's'}`"
        >
          <Icon
            name="lucide:paperclip"
            class="w-3.5 h-3.5"
            aria-hidden="true"
          />
          <span class="tabular-nums">{{ msg.attachmentCount }}</span>
          <span class="sr-only"
            >attachment{{ msg.attachmentCount === 1 ? "" : "s" }}</span
          >
        </span>
        <Badge
          v-if="(msg.spamScore ?? 0) >= 3"
          :tone="spam.tone"
          class="shrink-0"
          >{{ spam.label }} {{ msg.spamScore }}</Badge
        >
        <!-- "Received" is the default in a sinkhole, so it carries no signal; only other states get a badge -->
        <StatusBadge
          v-if="msg.status !== 'received'"
          :status="msg.status"
          class="shrink-0"
        />
      </div>
      <p
        v-if="msg.bounceReason"
        class="text-xs font-mono text-red-700 dark:text-red-400 truncate mt-0.5"
      >
        {{ msg.bounceReason }}
      </p>
      <p
        v-else-if="msg.textPreview"
        class="text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5"
      >
        {{ msg.textPreview }}
      </p>
    </NuxtLink>
    <!-- Sibling of the link (not nested inside it) -->
    <button
      type="button"
      :disabled="toggling"
      :tabindex="active ? 0 : -1"
      :aria-label="
        msg.isRead
          ? `Mark “${msg.subject || 'no subject'}” as unread`
          : `Mark “${msg.subject || 'no subject'}” as read`
      "
      class="absolute right-2 bottom-2 icon-btn disabled:opacity-40 disabled:cursor-not-allowed"
      :class="
        msg.isRead
          ? 'hover:text-indigo-700 dark:hover:text-indigo-300'
          : 'text-indigo-700 dark:text-indigo-300'
      "
      @click="$emit('toggle-read')"
    >
      <Icon
        :name="msg.isRead ? 'lucide:mail' : 'lucide:mail-open'"
        class="w-4 h-4"
      />
    </button>
  </li>
</template>
