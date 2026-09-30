<script setup lang="ts">
type Log = {
  id: string;
  recipient: string;
  status: string;
  attempts: number;
  mxHost: string | null;
  smtpCode: number | null;
  smtpResponse: string | null;
  deliveredAt: string | null;
};

defineProps<{
  status: string;
  logs: Log[] | null;
  loading: boolean;
  error: boolean;
}>();
defineEmits<{ refresh: [] }>();
</script>

<template>
  <div>
    <div
      v-if="status === 'received'"
      class="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 text-sm text-gray-700 dark:text-gray-300"
    >
      <Icon
        name="lucide:info"
        class="w-4 h-4 mt-0.5 shrink-0 text-gray-600 dark:text-gray-400"
      />
      <span
        >This is an inbound message. Delivery logs are only recorded for
        messages sent via MailPocket.</span
      >
    </div>
    <template v-else>
      <div class="flex items-center justify-between mb-3">
        <h2
          class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider"
        >
          Delivery Logs
        </h2>
        <UBtn
          variant="ghost"
          size="xs"
          icon="lucide:refresh-cw"
          :loading="loading"
          @click="$emit('refresh')"
          >Refresh</UBtn
        >
      </div>
      <p
        v-if="loading && logs === null"
        role="status"
        class="text-sm text-gray-600 dark:text-gray-400"
      >
        Loading delivery logs…
      </p>
      <InlineError v-else-if="error" retryable @retry="$emit('refresh')"
        >Couldn't load delivery logs.</InlineError
      >
      <EmptyState
        v-else-if="!logs?.length"
        icon="lucide:truck"
        title="No delivery logs yet"
        compact
      >
        The message may still be queued or processing.
      </EmptyState>
      <ul v-else class="space-y-3">
        <li
          v-for="log in logs"
          :key="log.id"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="text-sm font-medium text-gray-800 dark:text-gray-100 break-all"
                >{{ log.recipient }}</span
              >
              <CopyButton :text="log.recipient" label="recipient" />
              <StatusBadge :status="log.status" />
            </div>
            <span class="text-xs text-gray-600 dark:text-gray-400"
              >Attempt #{{ log.attempts }}</span
            >
          </div>
          <div
            class="mt-1 text-xs text-gray-600 dark:text-gray-400 space-y-0.5"
          >
            <p v-if="log.mxHost">MX: {{ log.mxHost }}</p>
            <p
              v-if="log.smtpCode || log.smtpResponse"
              class="flex items-center gap-1"
            >
              <span class="font-mono"
                >SMTP {{ log.smtpCode }}: {{ log.smtpResponse }}</span
              >
              <CopyButton
                :text="log.smtpResponse ?? String(log.smtpCode)"
                label="SMTP response"
              />
            </p>
            <p v-if="log.deliveredAt">
              Delivered:
              <time :datetime="log.deliveredAt">{{
                formatDateTime(log.deliveredAt)
              }}</time>
            </p>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
