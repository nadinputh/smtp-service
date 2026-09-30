<script setup lang="ts">
const props = defineProps<{ inboxId: string; canEdit: boolean }>();
const emit = defineEmits<{ count: [n: number] }>();

const api = useApi();
const toast = useToast();
const { confirm } = useConfirm();

const webhooks = ref<Awaited<ReturnType<typeof api.getWebhooks>>>([]);
const loading = ref(false);
const loadError = ref(false);

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    webhooks.value = await api.getWebhooks(props.inboxId);
    emit("count", webhooks.value.length);
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

// ── Add ──
const showAdd = ref(false);
const adding = ref(false);
const addError = ref("");
const form = reactive({
  url: "",
  onDelivered: true,
  onBounced: true,
  onOpened: false,
  onReceived: true,
});
const EVENTS = [
  {
    key: "onDelivered" as const,
    label: "Delivered",
    hint: "An email is successfully delivered",
  },
  { key: "onBounced" as const, label: "Bounced", hint: "A delivery bounces" },
  {
    key: "onOpened" as const,
    label: "Opened",
    hint: "A recipient opens the email",
  },
  {
    key: "onReceived" as const,
    label: "Received",
    hint: "An email arrives in this inbox",
  },
];

async function add() {
  addError.value = "";
  adding.value = true;
  try {
    await api.createWebhook(props.inboxId, form);
    showAdd.value = false;
    form.url = "";
    await load();
    toast.success("Webhook added");
  } catch (e: any) {
    addError.value = e?.data?.error || "Couldn't add the webhook.";
  } finally {
    adding.value = false;
  }
}

async function remove(wh: { id: string; url: string }) {
  const ok = await confirm({
    title: "Delete this webhook?",
    message: `${wh.url} will stop receiving events.`,
    confirmLabel: "Delete webhook",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteWebhook(props.inboxId, wh.id);
    await load();
    toast.success("Webhook deleted");
  } catch {
    toast.error("Couldn't delete the webhook. Please try again.");
  }
}

// ── Logs ──
const expanded = ref<string | null>(null);
const logs = ref<Awaited<ReturnType<typeof api.getWebhookLogs>>>([]);
const logsLoading = ref(false);

async function toggleLogs(id: string) {
  if (expanded.value === id) {
    expanded.value = null;
    return;
  }
  expanded.value = id;
  logsLoading.value = true;
  try {
    logs.value = await api.getWebhookLogs(props.inboxId, id);
  } catch {
    logs.value = [];
    toast.error("Couldn't load the delivery logs.");
  } finally {
    logsLoading.value = false;
  }
}

async function retryLog(webhookId: string, logId: string) {
  try {
    await api.retryWebhookLog(props.inboxId, webhookId, logId);
    logs.value = await api.getWebhookLogs(props.inboxId, webhookId);
    toast.success("Retry queued");
  } catch {
    toast.error("Couldn't retry the delivery.");
  }
}

const eventTone = {
  onDelivered: "success",
  onBounced: "danger",
  onOpened: "info",
  onReceived: "purple",
} as const;

load();
</script>

<template>
  <div class="p-6">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Event notifications for this inbox
      </p>
      <UBtn v-if="canEdit" size="sm" icon="lucide:plus" @click="showAdd = true">
        Add Webhook
      </UBtn>
    </div>

    <p
      v-if="loading"
      role="status"
      class="text-sm text-gray-600 dark:text-gray-400"
    >
      Loading webhooks…
    </p>
    <InlineError v-else-if="loadError" retryable @retry="load">
      Couldn't load webhooks.
    </InlineError>
    <EmptyState
      v-else-if="!webhooks.length"
      icon="lucide:webhook"
      title="No webhooks configured"
      compact
    />
    <ul v-else class="space-y-3">
      <li
        v-for="wh in webhooks"
        :key="wh.id"
        class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <div class="p-3 flex flex-wrap items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <code class="text-sm text-gray-800 dark:text-gray-100 break-all">{{
              wh.url
            }}</code>
            <div class="flex flex-wrap items-center gap-2 mt-1">
              <template v-for="ev in EVENTS" :key="ev.key">
                <Badge v-if="wh[ev.key]" :tone="eventTone[ev.key]">{{
                  ev.label.toLowerCase()
                }}</Badge>
              </template>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UBtn
              variant="secondary"
              size="xs"
              :aria-expanded="expanded === wh.id"
              :aria-controls="`webhook-logs-${wh.id}`"
              @click="toggleLogs(wh.id)"
            >
              {{ expanded === wh.id ? "Hide logs" : "Logs" }}
            </UBtn>
            <UBtn
              v-if="canEdit"
              variant="danger"
              size="xs"
              icon="lucide:trash-2"
              :aria-label="`Delete webhook ${wh.url}`"
              @click="remove(wh)"
            />
          </div>
        </div>
        <div
          v-if="expanded === wh.id"
          :id="`webhook-logs-${wh.id}`"
          class="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2"
        >
          <p
            v-if="logsLoading"
            role="status"
            class="text-xs text-gray-600 dark:text-gray-400 py-2"
          >
            Loading logs…
          </p>
          <p
            v-else-if="!logs.length"
            class="text-xs text-gray-600 dark:text-gray-400 py-2"
          >
            No delivery logs yet
          </p>
          <ul v-else class="space-y-1.5 max-h-60 overflow-y-auto">
            <li
              v-for="log in logs"
              :key="log.id"
              class="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-gray-800 rounded px-2 py-1.5 text-xs border border-gray-100 dark:border-gray-700"
            >
              <div class="flex flex-wrap items-center gap-2">
                <StatusBadge :status="log.status" />
                <span class="text-gray-700 dark:text-gray-300">{{
                  log.event
                }}</span>
                <span
                  v-if="log.statusCode"
                  class="text-gray-600 dark:text-gray-400"
                  >HTTP {{ log.statusCode }}</span
                >
                <span class="text-gray-600 dark:text-gray-400"
                  >Attempt {{ log.attempt }}</span
                >
              </div>
              <div class="flex items-center gap-2">
                <time
                  :datetime="log.createdAt"
                  class="text-gray-600 dark:text-gray-400"
                  >{{ formatDateTime(log.createdAt) }}</time
                >
                <UBtn
                  v-if="log.status === 'failed'"
                  variant="secondary"
                  size="xs"
                  @click="retryLog(wh.id, log.id)"
                >
                  Retry
                </UBtn>
              </div>
            </li>
          </ul>
        </div>
      </li>
    </ul>

    <Modal v-if="showAdd" title="Add Webhook" @close="showAdd = false">
      <form id="webhook-form" class="space-y-3" @submit.prevent="add">
        <div>
          <label
            for="webhook-url"
            class="block text-sm text-gray-700 dark:text-gray-300 mb-1"
            >Endpoint URL</label
          >
          <input
            id="webhook-url"
            v-model="form.url"
            type="url"
            required
            placeholder="https://your-endpoint.com/webhook"
            class="field"
          />
        </div>
        <fieldset class="space-y-2">
          <legend class="text-sm text-gray-700 dark:text-gray-300 mb-1">
            Send events
          </legend>
          <label
            v-for="ev in EVENTS"
            :key="ev.key"
            class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
            :class="
              form[ev.key]
                ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
                : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            "
          >
            <input
              v-model="form[ev.key]"
              type="checkbox"
              class="mt-0.5 rounded border-gray-400 dark:border-gray-400 text-indigo-600 focus:ring-indigo-500"
            />
            <span>
              <span
                class="block text-sm font-medium text-gray-800 dark:text-gray-100"
                >{{ ev.label }}</span
              >
              <span class="block text-xs text-gray-600 dark:text-gray-400">{{
                ev.hint
              }}</span>
            </span>
          </label>
        </fieldset>
        <InlineError v-if="addError">{{ addError }}</InlineError>
      </form>
      <template #footer>
        <UBtn type="button" variant="ghost" @click="showAdd = false"
          >Cancel</UBtn
        >
        <UBtn type="submit" form="webhook-form" :loading="adding">{{
          adding ? "Adding…" : "Add"
        }}</UBtn>
      </template>
    </Modal>
  </div>
</template>
