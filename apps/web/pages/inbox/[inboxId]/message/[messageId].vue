<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center gap-4"
    >
      <NuxtLink
        :to="`/inbox/${inboxId}`"
        class="text-gray-400 hover:text-gray-600 transition-colors"
      >
        <Icon name="lucide:arrow-left" class="w-5 h-5" />
      </NuxtLink>
      <div class="min-w-0 flex-1">
        <h2
          class="text-lg font-semibold text-gray-800 dark:text-gray-100 truncate"
        >
          {{ message?.subject || "(no subject)" }}
        </h2>
        <p class="text-sm text-gray-400">From: {{ message?.from }}</p>
      </div>
      <a
        :href="`/api/messages/${messageId}/raw`"
        target="_blank"
        class="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 shrink-0"
      >
        Download .eml
      </a>
      <button
        class="text-xs px-3 py-1.5 rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50 shrink-0"
        @click="showForwardModal = true"
      >
        Forward
      </button>
      <button
        v-if="message?.status === 'scheduled'"
        class="text-xs px-3 py-1.5 rounded-md border border-orange-200 text-orange-600 hover:bg-orange-50 shrink-0"
        @click="handleCancelSchedule"
      >
        Cancel Schedule
      </button>
      <button
        class="text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-500 hover:bg-red-50 shrink-0"
        @click="handleDelete"
      >
        Delete
      </button>
    </header>

    <div v-if="pending" class="p-6 text-gray-400">Loading...</div>

    <div v-else-if="message" class="flex-1 overflow-y-auto">
      <!-- Metadata -->
      <div
        class="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm space-y-1"
      >
        <div>
          <span class="text-gray-400 w-12 inline-block">To:</span>
          {{ message.to.join(", ") }}
        </div>
        <div v-if="message.cc?.length">
          <span class="text-gray-400 w-12 inline-block">Cc:</span>
          {{ message.cc.join(", ") }}
        </div>
        <div>
          <span class="text-gray-400 w-12 inline-block">Date:</span>
          {{ message.date ? new Date(message.date).toLocaleString() : "—" }}
        </div>
      </div>

      <!-- Tab switcher -->
      <div class="border-b border-gray-200 dark:border-gray-700 px-6">
        <nav class="flex gap-4 -mb-px">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="py-3 text-sm border-b-2 transition-colors"
            :class="
              activeTab === tab.key
                ? 'border-indigo-500 text-indigo-600 font-medium'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            "
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </nav>
      </div>

      <!-- Body -->
      <div class="flex-1 p-6">
        <!-- HTML preview -->
        <div
          v-if="activeTab === 'html' && message.html"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
        >
          <iframe
            :srcdoc="message.html"
            class="w-full min-h-[400px] border-0"
            sandbox="allow-same-origin"
          />
        </div>
        <p
          v-else-if="activeTab === 'html'"
          class="text-gray-400 dark:text-gray-500 text-sm"
        >
          No HTML body
        </p>

        <!-- Plain text -->
        <pre
          v-if="activeTab === 'text'"
          class="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >{{ message.text || "No plain text body" }}</pre
        >

        <!-- Attachments -->
        <div v-if="activeTab === 'attachments'">
          <div
            v-if="!message.attachments?.length"
            class="text-sm text-gray-400"
          >
            No attachments
          </div>
          <template v-else>
            <!-- Image thumbnails grid -->
            <div v-if="imageAttachments.length" class="mb-6">
              <p
                class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3"
              >
                Images
              </p>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div
                  v-for="{ att, idx } in imageAttachments"
                  :key="idx"
                  class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden group cursor-pointer"
                  @click="previewAttachment = idx"
                >
                  <img
                    :src="`/api/messages/${messageId}/attachments/${idx}`"
                    :alt="att.filename"
                    class="w-full h-32 object-cover"
                    loading="lazy"
                  />
                  <div class="p-2">
                    <p
                      class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate"
                    >
                      {{ att.filename }}
                    </p>
                    <p class="text-[10px] text-gray-400 dark:text-gray-500">
                      {{ formatBytes(att.size) }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- All attachments list -->
            <p
              v-if="imageAttachments.length && nonImageAttachments.length"
              class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3"
            >
              Other Files
            </p>
            <ul class="space-y-2">
              <li
                v-for="{ att, idx } in imageAttachments.length
                  ? nonImageAttachments
                  : allAttachments"
                :key="idx"
                class="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <Icon
                  name="lucide:paperclip"
                  class="w-4 h-4 text-gray-400 shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <p
                    class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate"
                  >
                    {{ att.filename }}
                  </p>
                  <p class="text-xs text-gray-400 dark:text-gray-500">
                    {{ att.contentType }} &middot; {{ formatBytes(att.size) }}
                  </p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    v-if="isPreviewable(att)"
                    @click="previewAttachment = idx"
                    class="text-xs px-2 py-1 text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-50 transition-colors"
                  >
                    Preview
                  </button>
                  <a
                    :href="`/api/messages/${messageId}/attachments/${idx}`"
                    target="_blank"
                    download
                    class="text-xs px-2 py-1 text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                  >
                    Download
                  </a>
                </div>
              </li>
            </ul>

            <!-- Inline Preview Modal -->
            <Teleport to="body">
              <div
                v-if="previewAttachment !== null"
                class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
                @click.self="previewAttachment = null"
              >
                <div
                  class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col m-4"
                >
                  <div
                    class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"
                  >
                    <h3
                      class="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate"
                    >
                      {{ message.attachments[previewAttachment].filename }}
                    </h3>
                    <div class="flex items-center gap-2">
                      <a
                        :href="`/api/messages/${messageId}/attachments/${previewAttachment}`"
                        target="_blank"
                        download
                        class="text-xs px-3 py-1.5 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        Download
                      </a>
                      <button
                        @click="previewAttachment = null"
                        class="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <Icon name="lucide:x" class="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div class="flex-1 overflow-auto p-4">
                    <!-- Image preview -->
                    <img
                      v-if="isImage(message.attachments[previewAttachment])"
                      :src="`/api/messages/${messageId}/attachments/${previewAttachment}`"
                      :alt="message.attachments[previewAttachment].filename"
                      class="max-w-full mx-auto"
                    />
                    <!-- PDF preview -->
                    <iframe
                      v-else-if="isPdf(message.attachments[previewAttachment])"
                      :src="`/api/messages/${messageId}/attachments/${previewAttachment}`"
                      class="w-full h-[70vh] border-0"
                    />
                    <!-- Text preview -->
                    <pre
                      v-else-if="isText(message.attachments[previewAttachment])"
                      class="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-[70vh] overflow-auto"
                      >{{ textPreviewContent }}</pre
                    >
                    <!-- Unsupported -->
                    <div v-else class="text-center py-16 text-gray-400">
                      <Icon
                        name="lucide:file"
                        class="w-16 h-16 mx-auto mb-4 opacity-50"
                      />
                      <p>Preview not available for this file type</p>
                    </div>
                  </div>
                </div>
              </div>
            </Teleport>
          </template>
        </div>

        <!-- Delivery Logs -->
        <div v-if="activeTab === 'delivery'">
          <div v-if="deliveryLogs === null" class="text-sm text-gray-400">
            Loading...
          </div>
          <div v-else-if="!deliveryLogs?.length" class="text-sm text-gray-400">
            No delivery logs
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="log in deliveryLogs"
              :key="log.id"
              class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span
                    class="text-sm font-medium text-gray-800 dark:text-gray-100"
                    >{{ log.recipient }}</span
                  >
                  <span
                    class="text-xs px-1.5 py-0.5 rounded-full"
                    :class="{
                      'bg-green-100 text-green-700': log.status === 'delivered',
                      'bg-red-100 text-red-700':
                        log.status === 'bounced' || log.status === 'failed',
                      'bg-yellow-100 text-yellow-700':
                        log.status === 'deferred' || log.status === 'sending',
                      'bg-gray-100 text-gray-500': log.status === 'queued',
                    }"
                  >
                    {{ log.status }}
                  </span>
                </div>
                <span class="text-xs text-gray-400"
                  >Attempt #{{ log.attempts }}</span
                >
              </div>
              <div class="mt-1 text-xs text-gray-500 space-y-0.5">
                <p v-if="log.mxHost">MX: {{ log.mxHost }}</p>
                <p v-if="log.smtpCode">
                  SMTP {{ log.smtpCode }}: {{ log.smtpResponse }}
                </p>
                <p v-if="log.deliveredAt">
                  Delivered: {{ new Date(log.deliveredAt).toLocaleString() }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Headers -->
        <div v-if="activeTab === 'headers'">
          <div v-if="headersData === null" class="text-sm text-gray-400">
            Loading...
          </div>
          <template v-else>
            <!-- Auth badges -->
            <div
              v-if="headersData.authChecks.length"
              class="flex items-center gap-2 mb-4"
            >
              <span class="text-xs font-semibold text-gray-400 uppercase"
                >Auth:</span
              >
              <span
                v-for="check in headersData.authChecks"
                :key="check.method"
                class="text-xs px-2 py-0.5 rounded-full font-medium"
                :class="authBadgeClass(check.result)"
              >
                {{ check.method }}: {{ check.result }}
              </span>
            </div>

            <!-- Hop trace -->
            <div v-if="headersData.hops.length" class="mb-4">
              <p class="text-xs font-semibold text-gray-400 uppercase mb-2">
                Routing Hops ({{ headersData.hops.length }})
              </p>
              <div class="space-y-1">
                <div
                  v-for="(hop, idx) in headersData.hops"
                  :key="idx"
                  class="flex items-center gap-2 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5"
                >
                  <span class="font-mono text-gray-600">{{ idx + 1 }}.</span>
                  <span class="text-gray-800">{{ hop.from }}</span>
                  <Icon
                    name="lucide:arrow-right"
                    class="w-3 h-3 text-gray-400 shrink-0"
                  />
                  <span class="text-gray-800">{{ hop.by }}</span>
                  <span
                    v-if="hop.delay"
                    class="ml-auto text-indigo-600 font-medium"
                    >+{{ hop.delay }}</span
                  >
                  <span v-if="hop.timestamp" class="text-gray-400 shrink-0">
                    {{ new Date(hop.timestamp).toLocaleString() }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Grouped headers -->
            <div class="space-y-3">
              <template v-for="(group, key) in headersData.groups" :key="key">
                <details v-if="group.length" class="group" open>
                  <summary
                    class="text-xs font-semibold text-gray-400 uppercase cursor-pointer hover:text-gray-600 mb-1"
                  >
                    {{ groupLabels[key] || key }} ({{ group.length }})
                  </summary>
                  <div class="space-y-1">
                    <div
                      v-for="(h, idx) in group"
                      :key="idx"
                      class="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm"
                    >
                      <span class="font-mono font-semibold text-indigo-600"
                        >{{ h.key }}:</span
                      >
                      <span class="ml-2 text-gray-700 break-all">{{
                        h.value
                      }}</span>
                    </div>
                  </div>
                </details>
              </template>
            </div>
          </template>
        </div>

        <!-- Raw Source -->
        <div v-if="activeTab === 'source'">
          <div v-if="rawSource === null" class="text-sm text-gray-400">
            Loading...
          </div>
          <pre
            v-else
            class="whitespace-pre-wrap text-xs font-mono text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 max-h-[600px] overflow-auto"
            >{{ rawSource }}</pre
          >
        </div>

        <!-- Spam Analysis -->
        <div v-if="activeTab === 'spam'">
          <div class="mb-4 flex items-center gap-3">
            <div
              class="text-2xl font-bold"
              :class="spamVerdict(message.spamScore ?? 0).color"
            >
              {{ message.spamScore ?? 0 }}
            </div>
            <span
              class="text-xs px-2 py-0.5 rounded-full font-medium"
              :class="{
                'bg-green-100 text-green-700': (message.spamScore ?? 0) < 3,
                'bg-yellow-100 text-yellow-700':
                  (message.spamScore ?? 0) >= 3 && (message.spamScore ?? 0) < 6,
                'bg-red-100 text-red-700': (message.spamScore ?? 0) >= 6,
              }"
            >
              {{ spamVerdict(message.spamScore ?? 0).label }}
            </span>
          </div>
          <div v-if="!message.spamRules?.length" class="text-sm text-gray-400">
            No spam rules triggered — email looks clean!
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="(rule, idx) in message.spamRules"
              :key="idx"
              class="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between"
            >
              <div>
                <span
                  class="font-mono text-xs font-semibold text-gray-800 dark:text-gray-100"
                  >{{ rule.rule }}</span
                >
                <p class="text-sm text-gray-500">{{ rule.description }}</p>
              </div>
              <span
                class="text-sm font-medium shrink-0 ml-4"
                :class="{
                  'text-yellow-600': rule.score < 2,
                  'text-orange-600': rule.score >= 2 && rule.score < 3,
                  'text-red-600': rule.score >= 3,
                }"
              >
                +{{ rule.score }}
              </span>
            </div>
          </div>

          <!-- Suggestions -->
          <div
            v-if="spamSuggestions.length"
            class="mt-5 border-t border-gray-100 pt-4"
          >
            <p class="text-xs font-semibold text-gray-400 uppercase mb-2">
              Suggestions
            </p>
            <ul class="space-y-1">
              <li
                v-for="(s, idx) in spamSuggestions"
                :key="idx"
                class="flex items-start gap-2 text-sm text-gray-600"
              >
                <Icon
                  name="lucide:lightbulb"
                  class="w-4 h-4 text-yellow-500 shrink-0 mt-0.5"
                />
                {{ s }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Forward Modal -->
    <Teleport to="body">
      <div
        v-if="showForwardModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="showForwardModal = false"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Forward Message
          </h2>
          <form @submit.prevent="handleForward">
            <input
              v-model="forwardTo"
              type="email"
              required
              placeholder="recipient@example.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p v-if="forwardError" class="text-sm text-red-600 mt-2">
              {{ forwardError }}
            </p>
            <p v-if="forwardSuccess" class="text-sm text-green-600 mt-2">
              Message forwarded and queued!
            </p>
            <div class="flex justify-end gap-2 mt-4">
              <button
                type="button"
                @click="showForwardModal = false"
                class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="forwarding"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {{ forwarding ? "Forwarding..." : "Forward" }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "default" });

const route = useRoute();
const api = useApi();
const inboxId = route.params.inboxId as string;
const messageId = route.params.messageId as string;

const activeTab = ref<
  "html" | "text" | "attachments" | "delivery" | "source" | "headers" | "spam"
>("html");

const tabs = [
  { key: "html" as const, label: "HTML" },
  { key: "text" as const, label: "Text" },
  { key: "attachments" as const, label: "Attachments" },
  { key: "delivery" as const, label: "Delivery" },
  { key: "headers" as const, label: "Headers" },
  { key: "source" as const, label: "Source" },
  { key: "spam" as const, label: "Spam" },
];

const deliveryLogs = ref<Awaited<
  ReturnType<typeof api.getDeliveryLogs>
> | null>(null);

const rawSource = ref<string | null>(null);
const headersData = ref<Awaited<
  ReturnType<typeof api.getMessageHeaders>
> | null>(null);

watch(activeTab, async (tab) => {
  if (tab === "delivery" && deliveryLogs.value === null) {
    deliveryLogs.value = await api.getDeliveryLogs(messageId);
  }
  if (tab === "source" && rawSource.value === null) {
    rawSource.value = await api.getMessageSource(messageId);
  }
  if (tab === "headers" && headersData.value === null) {
    headersData.value = await api.getMessageHeaders(messageId);
  }
});

const { data: message, pending } = useAsyncData(
  `message-${messageId}`,
  () => api.getMessage(messageId),
  { server: false },
);

// ─── Attachment Helpers ───────────────────────────────────
const previewAttachment = ref<number | null>(null);
const textPreviewContent = ref<string>("");

const imageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);
const textTypes = new Set([
  "text/plain",
  "text/csv",
  "text/xml",
  "text/html",
  "application/json",
  "application/xml",
]);

function isImage(att: { contentType: string }) {
  return imageTypes.has(att.contentType);
}
function isPdf(att: { contentType: string }) {
  return att.contentType === "application/pdf";
}
function isText(att: { contentType: string }) {
  return textTypes.has(att.contentType) || att.contentType.startsWith("text/");
}
function isPreviewable(att: { contentType: string }) {
  return isImage(att) || isPdf(att) || isText(att);
}

type AttEntry = {
  att: {
    filename: string;
    contentType: string;
    size: number;
    storageKey: string;
  };
  idx: number;
};

const allAttachments = computed<AttEntry[]>(() =>
  (message.value?.attachments ?? []).map((att, idx) => ({ att, idx })),
);
const imageAttachments = computed<AttEntry[]>(() =>
  allAttachments.value.filter(({ att }) => isImage(att)),
);
const nonImageAttachments = computed<AttEntry[]>(() =>
  allAttachments.value.filter(({ att }) => !isImage(att)),
);

watch(previewAttachment, async (idx) => {
  if (
    idx !== null &&
    message.value?.attachments?.[idx] &&
    isText(message.value.attachments[idx])
  ) {
    try {
      textPreviewContent.value = await $fetch<string>(
        `/api/messages/${messageId}/attachments/${idx}`,
        { responseType: "text" },
      );
    } catch {
      textPreviewContent.value = "Failed to load preview";
    }
  }
});

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function handleDelete() {
  if (!confirm("Are you sure you want to delete this message?")) return;
  await api.deleteMessage(messageId);
  navigateTo(`/inbox/${inboxId}`);
}

// ─── Forward ──────────────────────────────────────────────
const showForwardModal = ref(false);
const forwardTo = ref("");
const forwarding = ref(false);
const forwardError = ref("");
const forwardSuccess = ref(false);

async function handleForward() {
  forwardError.value = "";
  forwardSuccess.value = false;
  forwarding.value = true;
  try {
    await api.forwardMessage(messageId, forwardTo.value);
    forwardSuccess.value = true;
    setTimeout(() => {
      showForwardModal.value = false;
      forwardSuccess.value = false;
      forwardTo.value = "";
    }, 1500);
  } catch (e: any) {
    forwardError.value = e?.data?.error || "Failed to forward message";
  } finally {
    forwarding.value = false;
  }
}

// ─── Cancel Schedule ──────────────────────────────────────
async function handleCancelSchedule() {
  if (!confirm("Cancel the scheduled delivery?")) return;
  try {
    await api.cancelScheduledMessage(messageId);
    if (message.value) {
      message.value.status = "cancelled";
    }
  } catch (e: any) {
    alert(e?.data?.error || "Failed to cancel scheduled message");
  }
}

const groupLabels: Record<string, string> = {
  routing: "Routing",
  authentication: "Authentication",
  identity: "Identity",
  identification: "Identification",
  content: "Content",
  custom: "X-Headers",
  other: "Other",
};

function spamVerdict(score: number): { label: string; color: string } {
  if (score < 3) return { label: "Clean", color: "text-green-600" };
  if (score < 6) return { label: "Suspicious", color: "text-yellow-600" };
  return { label: "Spam", color: "text-red-600" };
}

const ruleSuggestionMap: Record<string, string> = {
  SUBJ_ALL_CAPS: "Avoid using ALL CAPS in the subject line.",
  MISSING_SUBJECT: "Always include a meaningful subject line.",
  SUBJ_SPAM_WORDS: "Remove spammy trigger words from the subject.",
  SUBJ_EXCESSIVE_PUNCTUATION: "Reduce excessive punctuation in the subject.",
  BODY_PHARMA_SPAM: "Remove pharmaceutical / health-scam keywords.",
  BODY_ADVANCE_FEE: "Avoid advance-fee / scam phrasing in the body.",
  BODY_MONEY_OFFERS: "Remove money-related solicitation language.",
  EXCESSIVE_LINKS: "Reduce the number of links (< 20 recommended).",
  HTML_MANY_LINKS: "Keep HTML link count below 10.",
  HTML_ONLY: "Include a plain-text alternative alongside HTML.",
  IMAGE_ONLY: "Add text content in addition to images.",
  SHORT_BODY: "Provide more meaningful body content.",
  MISSING_MESSAGE_ID: "Include a valid Message-ID header.",
  MISSING_DATE: "Include a Date header.",
  MISSING_MIME_VERSION: "Include a MIME-Version header.",
  NO_AUTH_RESULTS: "Set up email authentication (SPF, DKIM, DMARC).",
  NO_DKIM: "Sign your emails with DKIM.",
  NO_SPF: "Publish an SPF record for your sending domain.",
  FORGED_SENDER: "Ensure the envelope sender matches the From header domain.",
  SUSPICIOUS_MAILER: "Use a reputable email sending library / service.",
  NO_RECEIVED_HEADERS: "Received headers are expected — check your mail flow.",
  FROM_NO_REPLY: "Avoid using no-reply addresses; use a monitored sender.",
  MISSING_UNSUBSCRIBE: "Include a List-Unsubscribe header for bulk mail.",
  SINGLE_PART_BASE64:
    "Prefer quoted-printable or 7bit for single-part messages.",
};

const spamSuggestions = computed(() => {
  if (!message.value?.spamRules?.length) return [];
  return message.value.spamRules
    .map((r: { rule: string }) => ruleSuggestionMap[r.rule])
    .filter(Boolean) as string[];
});

function authBadgeClass(result: string): string {
  if (result === "pass") return "bg-green-100 text-green-700";
  if (result === "fail" || result === "softfail")
    return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-500";
}
</script>
