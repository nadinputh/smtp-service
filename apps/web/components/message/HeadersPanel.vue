<script setup lang="ts">
const props = defineProps<{ messageId: string }>();
const api = useApi();

const view = ref<"parsed" | "source">("parsed");

const headers = ref<Awaited<ReturnType<typeof api.getMessageHeaders>> | null>(
  null,
);
const headersLoading = ref(false);
const headersError = ref(false);
async function loadHeaders() {
  headersLoading.value = true;
  headersError.value = false;
  try {
    headers.value = await api.getMessageHeaders(props.messageId);
  } catch {
    headersError.value = true;
  } finally {
    headersLoading.value = false;
  }
}

const source = ref<string | null>(null);
const sourceLoading = ref(false);
const sourceError = ref(false);
async function loadSource() {
  sourceLoading.value = true;
  sourceError.value = false;
  try {
    source.value = await api.getMessageSource(props.messageId);
  } catch {
    sourceError.value = true;
  } finally {
    sourceLoading.value = false;
  }
}

watch(view, (v) => {
  if (v === "source" && source.value === null && !sourceError.value)
    loadSource();
});

const GROUP_LABELS: Record<string, string> = {
  routing: "Routing",
  authentication: "Authentication",
  identity: "Identity",
  identification: "Identification",
  content: "Content",
  custom: "X-Headers",
  other: "Other",
};

const authTone = (result: string) =>
  result === "pass"
    ? "success"
    : result === "fail" || result === "softfail"
      ? "danger"
      : "neutral";

loadHeaders();
</script>

<template>
  <div>
    <div class="mb-4">
      <SegmentedControl
        :model-value="view"
        :options="[
          { value: 'parsed', label: 'Parsed headers' },
          { value: 'source', label: 'Raw source' },
        ]"
        label="Headers view"
        @update:model-value="view = $event === 'source' ? 'source' : 'parsed'"
      />
    </div>

    <template v-if="view === 'parsed'">
      <p
        v-if="headersLoading && !headers"
        role="status"
        class="text-sm text-gray-600 dark:text-gray-400"
      >
        Loading headers…
      </p>
      <InlineError v-else-if="headersError" retryable @retry="loadHeaders"
        >Couldn't load headers.</InlineError
      >
      <template v-else-if="headers">
        <div
          v-if="headers.authChecks.length"
          class="flex flex-wrap items-center gap-2 mb-4"
        >
          <span
            class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase"
            >Auth:</span
          >
          <Badge
            v-for="check in headers.authChecks"
            :key="check.method"
            :tone="authTone(check.result)"
          >
            {{ check.method }}: {{ check.result }}
          </Badge>
        </div>

        <div v-if="headers.hops.length" class="mb-4">
          <h2
            class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2"
          >
            Routing hops ({{ headers.hops.length }})
          </h2>
          <ol class="space-y-1">
            <li
              v-for="(hop, idx) in headers.hops"
              :key="idx"
              class="flex flex-wrap items-center gap-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5"
            >
              <span class="font-mono text-gray-700 dark:text-gray-400"
                >{{ idx + 1 }}.</span
              >
              <span class="text-gray-800 dark:text-gray-200">{{
                hop.from
              }}</span>
              <Icon
                name="lucide:arrow-right"
                class="w-3 h-3 text-gray-600 dark:text-gray-400 shrink-0"
                aria-label="to"
              />
              <span class="text-gray-800 dark:text-gray-200">{{ hop.by }}</span>
              <span
                v-if="hop.delay"
                class="ml-auto text-indigo-700 dark:text-indigo-300 font-medium"
                >+{{ hop.delay }}</span
              >
              <time
                v-if="hop.timestamp"
                :datetime="hop.timestamp"
                class="text-gray-600 dark:text-gray-400 shrink-0"
                >{{ formatDateTime(hop.timestamp) }}</time
              >
            </li>
          </ol>
        </div>

        <div class="space-y-3">
          <template v-for="(group, key) in headers.groups" :key="key">
            <details v-if="group.length" open>
              <summary
                class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-900 dark:hover:text-gray-200 mb-1 py-1"
              >
                {{ GROUP_LABELS[key] || key }} ({{ group.length }})
              </summary>
              <div class="space-y-1">
                <div
                  v-for="(h, idx) in group"
                  :key="idx"
                  class="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm"
                >
                  <span
                    class="font-mono font-semibold text-indigo-700 dark:text-indigo-300"
                    >{{ h.key }}:</span
                  >
                  <span
                    class="ml-2 text-gray-700 dark:text-gray-300 break-all"
                    >{{ h.value }}</span
                  >
                </div>
              </div>
            </details>
          </template>
        </div>
      </template>
    </template>

    <template v-else>
      <p
        v-if="sourceLoading && source === null"
        role="status"
        class="text-sm text-gray-600 dark:text-gray-400"
      >
        Loading source…
      </p>
      <InlineError v-else-if="sourceError" retryable @retry="loadSource"
        >Couldn't load the message source.</InlineError
      >
      <pre
        v-else-if="source !== null"
        tabindex="0"
        class="whitespace-pre-wrap break-words text-xs font-mono text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 max-h-[600px] overflow-auto"
        >{{ source }}</pre>
    </template>
  </div>
</template>
