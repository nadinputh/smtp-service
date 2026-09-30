<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 py-3 min-h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-wrap items-center gap-x-4 gap-y-3"
    >
      <NuxtLink :to="backTo" aria-label="Back to inbox" class="icon-btn -ml-2">
        <Icon name="lucide:arrow-left" class="w-5 h-5" />
      </NuxtLink>
      <div class="min-w-0 flex-1 basis-48">
        <h1
          class="text-lg font-semibold text-gray-800 dark:text-gray-100 truncate"
        >
          {{
            message?.subject ||
            (messageError ? "Message unavailable" : "(no subject)")
          }}
        </h1>
        <p
          v-if="message"
          class="text-sm text-gray-600 dark:text-gray-400 truncate"
        >
          From: {{ message.from }}
        </p>
      </div>
      <div v-if="message" class="flex items-center gap-2">
        <div
          class="flex items-center"
          role="group"
          aria-label="Message navigation"
        >
          <button
            type="button"
            class="icon-btn"
            aria-label="Previous message (press [)"
            title="Previous message ( [ )"
            :disabled="!canPrev || navigating"
            @click="go('prev')"
          >
            <Icon name="lucide:chevron-up" class="w-5 h-5" />
          </button>
          <button
            type="button"
            class="icon-btn"
            aria-label="Next message (press ])"
            title="Next message ( ] )"
            :disabled="!canNext || navigating"
            @click="go('next')"
          >
            <Icon name="lucide:chevron-down" class="w-5 h-5" />
          </button>
        </div>
        <UBtn
          variant="secondary"
          size="sm"
          icon="lucide:forward"
          @click="showForward = true"
          >Forward</UBtn
        >
        <ActionMenu label="More" :items="menuItems" @select="onMenu" />
      </div>
    </header>

    <InlineError
      v-if="downloadError"
      block
      dismissible
      @dismiss="downloadError = ''"
      >{{ downloadError }}</InlineError
    >
    <InlineError v-if="cancelError" block>{{ cancelError }}</InlineError>

    <p
      v-if="pending && !message"
      role="status"
      class="p-6 text-gray-600 dark:text-gray-400"
    >
      Loading message…
    </p>

    <div
      v-else-if="messageError && !message"
      class="flex-1 flex flex-col items-center justify-center"
    >
      <EmptyState icon="lucide:mail-x" title="This message isn't available">
        It may have been deleted, or you no longer have access to this inbox.
        <template #action>
          <div class="flex gap-2 justify-center">
            <UBtn size="sm" variant="secondary" @click="refresh()"
              >Try again</UBtn
            >
            <UBtn size="sm" :to="backTo">Back to inbox</UBtn>
          </div>
        </template>
      </EmptyState>
    </div>

    <div v-else-if="message" class="flex-1 overflow-y-auto">
      <MessageDiagnosis
        :status="message.status"
        :logs="deliveryLogs"
        :resending="resending"
        @resend="resend"
      />

      <div
        class="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm space-y-1.5"
      >
        <RecipientList label="To" :addresses="message.to ?? []" />
        <RecipientList label="Cc" :addresses="message.cc ?? []" />
        <RecipientList label="Bcc" :addresses="message.bcc ?? []" />
        <div class="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <span class="text-gray-600 dark:text-gray-400 w-12 shrink-0"
            >Date:</span
          >
          <time :datetime="messageDate" :title="formatFullDate(messageDate)">{{
            formatDateTime(messageDate)
          }}</time>
          <StatusBadge :status="message.status" class="ml-2" />
        </div>
      </div>

      <TabBar
        v-model="activeTab"
        :tabs="tabs"
        label="Message detail sections"
        id-prefix="msg"
      />

      <div class="p-6">
        <TabPanel id-prefix="msg" tab="preview" :active="activeTab">
          <div class="mb-3" v-if="message.html && message.text">
            <SegmentedControl
              :model-value="previewMode"
              :options="[
                { value: 'html', label: 'HTML' },
                { value: 'text', label: 'Plain text' },
              ]"
              label="Body format"
              @update:model-value="
                previewOverride = $event === 'text' ? 'text' : 'html'
              "
            />
          </div>
          <MessageHtmlPreview
            v-if="previewMode === 'html' && message.html"
            :html="message.html"
          />
          <pre
            v-else-if="message.text"
            class="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
            >{{ message.text }}</pre>
          <EmptyState
            v-else
            icon="lucide:file-question"
            title="This message has no body"
            compact
          />
        </TabPanel>

        <TabPanel id-prefix="msg" tab="files" :active="activeTab">
          <MessageAttachmentsPanel
            :message-id="messageId"
            :attachments="message.attachments ?? []"
          />
        </TabPanel>

        <TabPanel id-prefix="msg" tab="delivery" :active="activeTab">
          <MessageDeliveryPanel
            :status="message.status"
            :logs="deliveryLogs"
            :loading="deliveryLoading"
            :error="deliveryError"
            @refresh="loadDelivery"
          />
        </TabPanel>

        <TabPanel id-prefix="msg" tab="headers" :active="activeTab">
          <MessageHeadersPanel :message-id="messageId" />
        </TabPanel>

        <TabPanel id-prefix="msg" tab="quality" :active="activeTab">
          <MessageQualityPanel
            :message-id="messageId"
            :spam-score="message.spamScore ?? null"
            :spam-rules="message.spamRules ?? null"
          />
        </TabPanel>
      </div>
    </div>

    <Modal
      v-if="showForward"
      title="Forward Message"
      @close="showForward = false"
    >
      <form id="forward-form" @submit.prevent="forward">
        <label
          for="forward-to"
          class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >Forward to</label
        >
        <input
          id="forward-to"
          v-model="forwardTo"
          type="email"
          required
          placeholder="recipient@example.com"
          class="field"
        />
        <InlineError v-if="forwardError" class="mt-2">{{
          forwardError
        }}</InlineError>
      </form>
      <template #footer>
        <UBtn type="button" variant="ghost" @click="showForward = false"
          >Cancel</UBtn
        >
        <UBtn type="submit" form="forward-form" :loading="forwarding">{{
          forwarding ? "Forwarding…" : "Forward"
        }}</UBtn>
      </template>
    </Modal>

    <InboxShortcutsModal
      v-if="showHelp"
      scope="message"
      @close="showHelp = false"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "default" });

const route = useRoute();
const api = useApi();
const toast = useToast();
const { confirm } = useConfirm();
const inboxId = route.params.inboxId as string;
const messageId = route.params.messageId as string;
const { apiBase, error: downloadError, download } = useAuthedDownload();

// ─── Navigation: back to the list you came from; prev/next through it ────────
const listQuery = computed(() => {
  const q: Record<string, string> = {};
  for (const k of LIST_QUERY_KEYS) {
    const v = route.query[k];
    if (typeof v === "string" && v) q[k] = v;
  }
  return q;
});
const backTo = computed(() => ({
  path: `/inbox/${inboxId}`,
  query: listQuery.value,
}));

const listNav = useListNav();
useLastOpened().value = { inboxId, messageId };
const navIndex = computed(() =>
  listNav.value.inboxId === inboxId ? listNav.value.ids.indexOf(messageId) : -1,
);
const canPrev = computed(
  () => navIndex.value > 0 || (navIndex.value === 0 && listNav.value.page > 1),
);
const canNext = computed(
  () =>
    navIndex.value >= 0 &&
    (navIndex.value < listNav.value.ids.length - 1 ||
      listNav.value.page < listNav.value.totalPages),
);

const navigating = ref(false);
async function go(dir: "prev" | "next") {
  if (navigating.value || navIndex.value < 0) return;
  const { ids, page } = listNav.value;
  const step = dir === "prev" ? -1 : 1;
  const linkTo = (id: string, pg: number) =>
    navigateTo({
      path: `/inbox/${inboxId}/message/${id}`,
      query: {
        ...listQuery.value,
        ...(pg > 1 ? { page: String(pg) } : { page: undefined }),
      },
    });
  const inPage = ids[navIndex.value + step];
  if (inPage) return linkTo(inPage, page);

  // Past the edge of the loaded page: load the neighbouring page of the same list.
  navigating.value = true;
  try {
    const target = page + step;
    const q = listQuery.value;
    const res = await api.getInboxMessages(inboxId, {
      q: q.q,
      status: q.status,
      after: q.after,
      before: q.before,
      ruleId: q.rule,
      page: target,
      limit: INBOX_PAGE_SIZE,
    });
    if (!res.messages.length) return;
    listNav.value = {
      inboxId,
      ids: res.messages.map((m) => m.id),
      page: target,
      totalPages: Math.max(1, Math.ceil(res.total / INBOX_PAGE_SIZE)),
    };
    const next =
      dir === "next" ? res.messages[0] : res.messages[res.messages.length - 1];
    await linkTo(next.id, target);
  } catch {
    toast.error("Couldn't load the next page of messages.");
  } finally {
    navigating.value = false;
  }
}

// ─── Message ─────────────────────────────────────────────────────────────────
const {
  data: message,
  pending,
  error: messageError,
  refresh,
} = useAsyncData(`message-${messageId}`, () => api.getMessage(messageId), {
  server: false,
});

useHead({ title: computed(() => message.value?.subject || "Message") });

const messageDate = computed(
  () => (message.value?.date || message.value?.createdAt || "") as string,
);

// Auto-mark message as read when viewed
watch(
  message,
  (msg) => {
    if (msg && !msg.isRead) {
      msg.isRead = true;
      api.markMessageRead(messageId).catch(() => {});
    }
  },
  { immediate: true },
);

// ─── Delivery (also feeds the diagnosis banner) ──────────────────────────────
const deliveryLogs = ref<Awaited<
  ReturnType<typeof api.getDeliveryLogs>
> | null>(null);
const deliveryLoading = ref(false);
const deliveryError = ref(false);

async function loadDelivery() {
  deliveryLoading.value = true;
  deliveryError.value = false;
  try {
    deliveryLogs.value = await api.getDeliveryLogs(messageId);
  } catch {
    deliveryError.value = true;
  } finally {
    deliveryLoading.value = false;
  }
}
// Inbound mail has no delivery logs; for everything else load them up front so
// a failure's reason can be shown next to the status.
watch(
  message,
  (m) => {
    if (
      m &&
      m.status !== "received" &&
      deliveryLogs.value === null &&
      !deliveryLoading.value
    )
      loadDelivery();
  },
  { immediate: true },
);

// ─── Tabs: open on what matters for this message ─────────────────────────────
const FAILED = ["bounced", "failed", "deferred", "suppressed"];
const userTab = ref<string | null>(null);
const activeTab = computed<string>({
  get: () =>
    userTab.value ??
    (message.value && FAILED.includes(message.value.status)
      ? "delivery"
      : "preview"),
  set: (v) => (userTab.value = v),
});

const previewOverride = ref<"html" | "text" | null>(null);
const previewMode = computed<"html" | "text">(
  () => previewOverride.value ?? (message.value?.html ? "html" : "text"),
);

const tabs = computed(() => {
  const verdict = spamVerdict(message.value?.spamScore);
  return [
    { key: "preview", label: "Preview" },
    {
      key: "files",
      label: "Files",
      badge: message.value?.attachments?.length || null,
      badgeLabel: message.value?.attachments?.length
        ? `${message.value.attachments.length} attachment${message.value.attachments.length === 1 ? "" : "s"}`
        : undefined,
    },
    { key: "delivery", label: "Delivery" },
    { key: "headers", label: "Headers & source" },
    {
      key: "quality",
      label: "Quality",
      badge:
        verdict.label === "Clean"
          ? null
          : `${verdict.label} ${message.value?.spamScore}`,
      badgeTone: verdict.tone,
    },
  ];
});

// ─── Actions ─────────────────────────────────────────────────────────────────
const menuItems = computed(() => [
  { key: "link", label: "Copy link", icon: "lucide:link" },
  { key: "eml", label: "Download .eml", icon: "lucide:download" },
  ...(message.value?.status === "scheduled"
    ? [
        {
          key: "cancel",
          label: "Cancel scheduled delivery",
          icon: "lucide:calendar-x",
        },
      ]
    : []),
  {
    key: "help",
    label: "Keyboard shortcuts",
    icon: "lucide:keyboard",
    separatorBefore: true,
  },
  {
    key: "delete",
    label: "Delete message",
    icon: "lucide:trash-2",
    danger: true,
    separatorBefore: true,
  },
]);

async function copyLink() {
  const url = new URL(
    useRouter().resolve({ path: `/inbox/${inboxId}/message/${messageId}` })
      .href,
    location.origin,
  ).href;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    toast.error("Couldn't copy the link.");
  }
}

function onMenu(key: string) {
  if (key === "link") copyLink();
  else if (key === "help") showHelp.value = true;
  else if (key === "eml")
    download(`${apiBase}/api/messages/${messageId}/raw`, `${messageId}.eml`);
  else if (key === "cancel") cancelSchedule();
  else if (key === "delete") remove();
}

async function remove() {
  const ok = await confirm({
    title: "Delete this message?",
    message: `“${message.value?.subject || "(no subject)"}” will be permanently deleted.`,
    confirmLabel: "Delete message",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteMessage(messageId);
    toast.success("Message deleted");
    navigateTo(backTo.value);
  } catch {
    toast.error("Couldn't delete the message. Please try again.");
  }
}

// Re-queue a bounced/failed message, then poll until it settles again.
const resending = ref(false);
let pollTimer: ReturnType<typeof setInterval> | undefined;
async function resend() {
  resending.value = true;
  try {
    await api.resendMessage(messageId);
    if (message.value) message.value.status = "queued";
    toast.info("Resend queued");
    let polls = 0;
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      polls++;
      try {
        const fresh = await api.getMessage(messageId);
        if (message.value) message.value.status = fresh.status;
        await loadDelivery();
        if (!["queued", "sending"].includes(fresh.status) || polls >= 15)
          clearInterval(pollTimer);
      } catch {
        clearInterval(pollTimer);
      }
    }, 2000);
  } catch (e: any) {
    toast.error(e?.data?.error || "Couldn't resend the message.");
  } finally {
    resending.value = false;
  }
}
onUnmounted(() => clearInterval(pollTimer));

const showForward = ref(false);
const forwardTo = ref("");
const forwarding = ref(false);
const forwardError = ref("");

async function forward() {
  forwardError.value = "";
  forwarding.value = true;
  try {
    await api.forwardMessage(messageId, forwardTo.value);
    showForward.value = false;
    forwardTo.value = "";
    toast.success("Message forwarded and queued");
  } catch (e: any) {
    forwardError.value = e?.data?.error || "Couldn't forward the message.";
  } finally {
    forwarding.value = false;
  }
}

const cancelError = ref("");
async function cancelSchedule() {
  const ok = await confirm({
    title: "Cancel the scheduled delivery?",
    message: "The message won't be sent.",
    confirmLabel: "Cancel delivery",
    danger: true,
  });
  if (!ok) return;
  cancelError.value = "";
  try {
    await api.cancelScheduledMessage(messageId);
    if (message.value) message.value.status = "cancelled";
  } catch (e: any) {
    cancelError.value =
      e?.data?.error || "Couldn't cancel the scheduled message.";
  }
}

// ─── Keyboard ────────────────────────────────────────────────────────────────
const showHelp = ref(false);
function onKeydown(e: KeyboardEvent) {
  if (shouldIgnoreHotkey(e)) return;
  if (e.key === "]") go("next");
  else if (e.key === "[") go("prev");
  else if (e.key === "u") navigateTo(backTo.value);
  else if (e.key === "?") showHelp.value = true;
}
onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>
