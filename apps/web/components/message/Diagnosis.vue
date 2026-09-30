<script setup lang="ts">
// Surfaces *why* a message didn't arrive right where the status is shown, so the
// reason isn't three tabs away.
type Log = {
  id: string;
  recipient: string;
  status: string;
  smtpCode: number | null;
  smtpResponse: string | null;
  mxHost: string | null;
};

const props = defineProps<{
  status: string;
  logs: Log[] | null;
  resending?: boolean;
}>();
defineEmits<{ resend: [] }>();

const failures = computed(() =>
  (props.logs ?? []).filter((l) =>
    ["bounced", "failed", "deferred"].includes(l.status),
  ),
);
const first = computed(() => failures.value[0] ?? null);
const isSuppressed = computed(() => props.status === "suppressed");
const show = computed(
  () =>
    isSuppressed.value ||
    (["bounced", "failed", "deferred"].includes(props.status) &&
      props.logs !== null),
);
const canResend = computed(() => ["bounced", "failed"].includes(props.status));
const gloss = computed(() =>
  first.value
    ? smtpGloss(first.value.smtpCode, first.value.smtpResponse)
    : null,
);
const detail = computed(() => {
  const f = first.value;
  if (!f) return "";
  const code = f.smtpCode ? `SMTP ${f.smtpCode}` : "";
  return [code, f.smtpResponse].filter(Boolean).join(": ");
});
</script>

<template>
  <div
    v-if="show"
    class="mx-6 mt-4 rounded-lg border px-4 py-3 text-sm flex flex-wrap items-start gap-3"
    :class="
      isSuppressed
        ? 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800'
        : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
    "
    :role="isSuppressed ? 'status' : 'alert'"
  >
    <Icon
      :name="isSuppressed ? 'lucide:shield-off' : 'lucide:mail-warning'"
      class="w-5 h-5 shrink-0 mt-0.5"
      :class="
        isSuppressed
          ? 'text-gray-600 dark:text-gray-400'
          : 'text-red-700 dark:text-red-400'
      "
      aria-hidden="true"
    />
    <div class="flex-1 min-w-0">
      <p
        class="font-medium"
        :class="
          isSuppressed
            ? 'text-gray-800 dark:text-gray-100'
            : 'text-red-900 dark:text-red-200'
        "
      >
        <template v-if="isSuppressed"
          >Not sent: the recipient is on your suppression list</template
        >
        <template v-else-if="first">
          {{ status === "deferred" ? "Delayed" : "Couldn't deliver" }} to
          {{ first.recipient }}
          <span v-if="failures.length > 1" class="font-normal"
            >and {{ failures.length - 1 }} more</span
          >
        </template>
        <template v-else>Delivery {{ status }}</template>
      </p>
      <p v-if="gloss" class="mt-0.5 text-red-900 dark:text-red-200">
        {{ gloss }}
      </p>
      <p
        v-if="detail"
        class="mt-0.5 font-mono text-xs text-red-800 dark:text-red-300 break-words"
      >
        {{ detail }}<span v-if="first?.mxHost"> · {{ first.mxHost }}</span>
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-1 w-full sm:w-auto sm:shrink-0">
      <UBtn
        v-if="canResend"
        variant="secondary"
        size="xs"
        icon="lucide:rotate-cw"
        :loading="resending"
        @click="$emit('resend')"
        >Resend</UBtn
      >
      <UBtn to="/suppressions" variant="ghost" size="xs">Suppressions</UBtn>
    </div>
  </div>
</template>
