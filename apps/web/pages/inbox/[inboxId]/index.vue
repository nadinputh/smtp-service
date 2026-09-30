<template>
  <div class="h-full flex flex-col">
    <div
      v-if="inboxError && !inboxDetail"
      class="flex-1 flex items-center justify-center"
    >
      <EmptyState icon="lucide:inbox" title="This inbox isn't available">
        It may have been deleted, or you no longer have access.
        <template #action>
          <UBtn to="/" size="sm" variant="secondary">Back to dashboard</UBtn>
        </template>
      </EmptyState>
    </div>

    <template v-else>
      <header
        class="px-6 py-3 min-h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-wrap items-center justify-between gap-x-4 gap-y-3"
      >
        <div class="min-w-0">
          <h1
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 truncate"
          >
            {{ inbox?.name ?? "Inbox" }}
          </h1>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ list.totalMessages.value }}
            {{ list.hasActiveFilters.value ? "matching" : "" }}
            {{ list.totalMessages.value === 1 ? "message" : "messages" }}
            <span
              v-if="list.totalUnread.value > 0"
              class="text-indigo-700 dark:text-indigo-300 font-medium"
              >· {{ list.totalUnread.value }} unread</span
            >
            <button
              v-if="list.attentionTotal.value > 0"
              type="button"
              class="ml-1 font-medium text-red-700 dark:text-red-400 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              @click="list.filterStatus.value = 'bounced,failed'"
            >
              · {{ list.attentionTotal.value }} need attention
            </button>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBtn
            v-if="list.pageUnreadIds.value.length > 0"
            variant="secondary"
            size="sm"
            icon="lucide:check-check"
            :loading="list.markingAllRead.value"
            @click="list.markPageRead"
          >
            {{
              list.hasActiveFilters.value || list.totalPages.value > 1
                ? "Mark page read"
                : "Mark all read"
            }}
          </UBtn>
          <ActionMenu
            label="Inbox actions"
            :items="menuItems"
            @select="onMenu"
          />
        </div>
      </header>

      <InboxCredentials
        v-if="showCreds && inboxDetail"
        :host="smtpHost"
        :port="smtpPort"
        :username="inboxDetail.smtpUsername"
        :password="inboxDetail.smtpPassword"
        @close="showCreds = false"
      />

      <InlineError
        v-if="downloadError"
        block
        dismissible
        @dismiss="downloadError = ''"
        >{{ downloadError }}</InlineError
      >

      <TabBar
        v-model="activeTab"
        :tabs="tabs"
        label="Inbox sections"
        id-prefix="inbox"
      />

      <TabPanel
        id-prefix="inbox"
        tab="messages"
        :active="activeTab"
        class="flex-1 min-h-0 flex flex-col"
      >
        <InboxRuleChips
          :rules="rules"
          :active-id="list.activeRuleId.value"
          :can-edit="isEditorOrAbove"
          @select="list.activeRuleId.value = $event"
          @edit="openRule"
          @new="openRule(null)"
        />

        <InboxBulkBar
          v-if="list.selected.value.size > 0"
          :count="list.selected.value.size"
          :page-size="list.messages.value.length"
          :can-select-all-matching="list.canSelectAllMatching.value"
          :all-matching="list.allMatching.value"
          :matching-total="list.totalMessages.value"
          :matching-reachable="list.matchingReachable.value"
          :selecting-all="list.selectingAll.value"
          :can-delete="isEditorOrAbove"
          @select-page="list.selectPage"
          @select-all="list.selectAllMatching"
          @read="list.markSelected"
          @delete="list.deleteSelected"
          @clear="list.clearSelection"
        />
        <InboxFilterBar
          v-else
          ref="filterBar"
          v-model:search="list.searchQuery.value"
          v-model:status="list.filterStatus.value"
          v-model:after="list.filterAfter.value"
          v-model:before="list.filterBefore.value"
          :attention-total="list.attentionTotal.value"
          :has-active-filters="list.hasActiveFilters.value"
          @clear="list.clearFilters"
        />

        <p
          v-if="list.pending.value && !list.messages.value.length"
          role="status"
          class="p-6 text-gray-600 dark:text-gray-400"
        >
          Loading messages…
        </p>
        <div
          v-else-if="list.fetchError.value && !list.messages.value.length"
          class="p-6 flex justify-center"
        >
          <EmptyState
            icon="lucide:alert-circle"
            title="Couldn't load messages"
            compact
          >
            Check your connection and try again.
            <template #action
              ><UBtn size="sm" @click="list.loadMessages()"
                >Retry</UBtn
              ></template
            >
          </EmptyState>
        </div>
        <EmptyState
          v-else-if="!list.messages.value.length"
          icon="lucide:inbox"
          :title="
            list.hasActiveFilters.value
              ? 'No messages match your search'
              : 'No messages in this inbox yet'
          "
        >
          <template v-if="!list.hasActiveFilters.value">
            Point your app's SMTP settings at
            <code
              class="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 px-1 rounded"
              >{{ smtpHost }}:{{ smtpPort }}</code
            >
            and send a message; it will appear here.
            <template v-if="isEditorOrAbove">
              Your credentials are under Inbox actions.</template
            >
          </template>
        </EmptyState>

        <template v-else>
          <InlineError
            v-if="list.fetchError.value"
            block
            retryable
            @retry="list.loadMessages()"
            >Couldn't refresh the list — showing the last loaded
            messages.</InlineError
          >
          <ul
            ref="listRef"
            aria-label="Messages"
            class="divide-y divide-gray-100 dark:divide-gray-700 flex-1 min-h-0 overflow-y-auto"
            :aria-busy="list.pending.value"
            @keydown="onRowKeydown"
          >
            <InboxMessageRow
              v-for="(msg, i) in list.messages.value"
              :key="msg.id"
              :msg="msg"
              :to="{
                path: `/inbox/${inboxId}/message/${msg.id}`,
                query: list.listQuery.value,
              }"
              :selected="list.selected.value.has(msg.id)"
              :toggling="list.togglingReadIds.value.has(msg.id)"
              :active="isActiveRow(msg.id, i)"
              @focus="activeRowId = msg.id"
              @check="list.toggleSelected(msg.id, i, $event.shiftKey)"
              @open="list.markOpened(msg)"
              @toggle-read="list.toggleRead(msg)"
            />
          </ul>

          <nav
            v-if="list.totalPages.value > 1"
            aria-label="Message pages"
            class="px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between shrink-0"
          >
            <p class="text-xs text-gray-600 dark:text-gray-400">
              {{ list.totalMessages.value }} message{{
                list.totalMessages.value === 1 ? "" : "s"
              }}
              · Page {{ list.currentPage.value }} of {{ list.totalPages.value }}
            </p>
            <div class="flex gap-1">
              <UBtn
                variant="secondary"
                size="sm"
                :disabled="list.currentPage.value <= 1"
                @click="list.currentPage.value--"
                >Prev</UBtn
              >
              <UBtn
                variant="secondary"
                size="sm"
                :disabled="list.currentPage.value >= list.totalPages.value"
                @click="list.currentPage.value++"
                >Next</UBtn
              >
            </div>
          </nav>
        </template>
      </TabPanel>

      <TabPanel
        id-prefix="inbox"
        tab="webhooks"
        :active="activeTab"
        class="flex-1 overflow-y-auto"
      >
        <InboxWebhooksPanel
          :inbox-id="inboxId"
          :can-edit="isEditorOrAbove"
          @count="webhookCount = $event"
        />
      </TabPanel>

      <TabPanel
        id-prefix="inbox"
        tab="members"
        :active="activeTab"
        class="flex-1 overflow-y-auto"
      >
        <InboxMembersPanel
          :inbox-id="inboxId"
          :is-owner="isOwner"
          @count="memberCount = $event"
        />
      </TabPanel>
    </template>

    <InboxRuleModal
      v-if="ruleModalOpen"
      :inbox-id="inboxId"
      :rule="editingRule"
      @close="ruleModalOpen = false"
      @saved="onRuleSaved"
      @deleted="onRuleDeleted"
    />
    <InboxShortcutsModal
      v-if="showHelp"
      scope="list"
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
const runtimeConfig = useRuntimeConfig();
const smtpHost = runtimeConfig.public.smtpHost;
const smtpPort = runtimeConfig.public.smtpPort;
const { apiBase, error: downloadError, download } = useAuthedDownload();

const inboxId = route.params.inboxId as string;

// ─── Inbox + role ────────────────────────────────────────────────────────────
const { data: inboxDetail, error: inboxError } = useAsyncData(
  `inbox-detail-${inboxId}`,
  () => api.getInbox(inboxId),
);
const inbox = computed(() => inboxDetail.value);
useHead({ title: computed(() => inbox.value?.name ?? "Inbox") });

const inboxRole = computed(
  () => inboxDetail.value?.currentUserRole ?? "viewer",
);
const isOwner = computed(() => inboxRole.value === "owner");
const isEditorOrAbove = computed(
  () => inboxRole.value === "owner" || inboxRole.value === "editor",
);

// ─── The message list (filters, paging, selection, live updates) ─────────────
const list = useInboxMessages(inboxId);
const listRef = ref<HTMLElement | null>(null);
const filterBar = ref<{ focusSearch: () => void } | null>(null);
list.scrollToTop.value = () => listRef.value?.scrollTo({ top: 0 });

// ─── Tabs ────────────────────────────────────────────────────────────────────
const activeTab = ref("messages");
const webhookCount = ref<number | null>(null);
const memberCount = ref<number | null>(null);
const tabs = computed(() => [
  {
    key: "messages",
    label: "Messages",
    badge: list.totalMessages.value,
    badgeLabel: `${list.totalMessages.value} messages`,
  },
  {
    key: "webhooks",
    label: "Webhooks",
    badge: webhookCount.value,
    badgeLabel: `${webhookCount.value} webhooks`,
  },
  {
    key: "members",
    label: "Members",
    badge: memberCount.value,
    badgeLabel: `${memberCount.value} members`,
  },
]);

// ─── Header actions ──────────────────────────────────────────────────────────
const showCreds = ref(false);
const showHelp = ref(false);

const menuItems = computed(() => [
  {
    key: "h-export",
    label: list.hasActiveFilters.value
      ? "Export filtered results"
      : "Export entire inbox",
    heading: true,
  },
  { key: "export:csv", label: "CSV", icon: "lucide:file-spreadsheet" },
  { key: "export:mbox", label: "MBOX", icon: "lucide:archive" },
  { key: "export:eml", label: "EML (ZIP)", icon: "lucide:file-archive" },
  ...(isEditorOrAbove.value
    ? [
        {
          key: "creds",
          label: showCreds.value ? "Hide SMTP credentials" : "SMTP credentials",
          icon: "lucide:key",
          separatorBefore: true,
        },
      ]
    : []),
  {
    key: "help",
    label: "Keyboard shortcuts",
    icon: "lucide:keyboard",
    separatorBefore: !isEditorOrAbove.value,
  },
  ...(isOwner.value
    ? [
        {
          key: "delete",
          label: "Delete inbox",
          icon: "lucide:trash-2",
          danger: true,
          separatorBefore: true,
        },
      ]
    : []),
]);

function onMenu(key: string) {
  if (key.startsWith("export:")) runExport(key.slice(7));
  else if (key === "creds") showCreds.value = !showCreds.value;
  else if (key === "help") showHelp.value = true;
  else if (key === "delete") deleteInbox();
}

const EXPORT_EXT: Record<string, string> = {
  csv: "csv",
  mbox: "mbox",
  eml: "zip",
};

// Export reflects whatever is currently filtered/searched on screen.
function buildExportUrl(format: string) {
  const params = new URLSearchParams({ format });
  const f = list.listQuery.value;
  if (f.q) params.set("q", f.q);
  if (f.status) params.set("status", f.status);
  if (f.after) params.set("after", f.after);
  if (f.before) params.set("before", f.before);
  if (f.rule) params.set("ruleId", f.rule);
  return `${apiBase}/api/inboxes/${inboxId}/export?${params.toString()}`;
}

async function runExport(format: string) {
  const slug =
    (inbox.value?.name ?? "inbox")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "inbox";
  toast.info("Preparing your export…");
  const result = await download(
    buildExportUrl(format),
    `${slug}-export.${EXPORT_EXT[format]}`,
  );
  if (!result) return;
  toast.success(
    result.truncated
      ? "Export saved — limited to the 10,000 most recent messages."
      : "Export saved",
  );
}

async function deleteInbox() {
  const ok = await confirm({
    title: "Delete this inbox?",
    message: `“${inbox.value?.name ?? "This inbox"}” and all ${list.totalMessages.value} of its messages will be permanently deleted.`,
    confirmLabel: "Delete inbox",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteInbox(inboxId);
    clearNuxtData("inboxes");
    toast.success("Inbox deleted");
    navigateTo("/");
  } catch {
    toast.error("Couldn't delete the inbox. Please try again.");
  }
}

// ─── Row focus: one tab stop for the whole list ──────────────────────────────
// Only the active row is in the tab order (Tab reaches its checkbox, link and
// read toggle); Up/Down/Home/End move between rows. Arrow keys aren't
// single-character shortcuts, so they stay on when j/k are switched off.
const activeRowId = ref<string | null>(null);
function isActiveRow(id: string, index: number) {
  const known = list.messages.value.some((m) => m.id === activeRowId.value);
  return known ? activeRowId.value === id : index === 0;
}

function onRowKeydown(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const links = rowLinks();
  const i = links.findIndex((l) => l.parentElement?.contains(e.target as Node));
  if (i < 0) return;
  const next =
    e.key === "ArrowDown"
      ? Math.min(links.length - 1, i + 1)
      : e.key === "ArrowUp"
        ? Math.max(0, i - 1)
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? links.length - 1
            : -1;
  if (next < 0) return;
  e.preventDefault();
  links[next].focus();
}

// Coming back from a message: land on the row you left.
const lastOpened = useLastOpened();
const stopRestore = watch(list.messages, async (msgs) => {
  if (!msgs.length) return;
  stopRestore();
  const { inboxId: from, messageId } = lastOpened.value;
  lastOpened.value = { inboxId: "", messageId: "" };
  if (from !== inboxId || !msgs.some((m) => m.id === messageId)) return;
  activeRowId.value = messageId;
  await nextTick();
  const li = listRef.value?.querySelector<HTMLElement>(
    `li[data-id="${messageId}"]`,
  );
  li?.scrollIntoView({ block: "center" });
  li?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
});

// ─── Keyboard ────────────────────────────────────────────────────────────────
function rowLinks() {
  return [...(listRef.value?.querySelectorAll<HTMLElement>("li > a") ?? [])];
}

function onKeydown(e: KeyboardEvent) {
  if (activeTab.value !== "messages") return;
  if (
    e.key === "Escape" &&
    list.selected.value.size &&
    !document.querySelector('[role="dialog"], [role="alertdialog"]')
  ) {
    list.clearSelection();
    return;
  }
  if (shouldIgnoreHotkey(e)) return;
  const links = rowLinks();
  const current = links.findIndex(
    (l) =>
      l === document.activeElement ||
      l.parentElement?.contains(document.activeElement),
  );
  if (e.key === "j") {
    e.preventDefault();
    links[Math.min(links.length - 1, current + 1)]?.focus();
  } else if (e.key === "k") {
    e.preventDefault();
    links[Math.max(0, current === -1 ? 0 : current - 1)]?.focus();
  } else if (e.key === "x" && current >= 0) {
    e.preventDefault();
    const id = links[current].parentElement?.dataset.id;
    const index = list.messages.value.findIndex((m) => m.id === id);
    if (index >= 0) list.toggleSelected(list.messages.value[index].id, index);
  } else if (e.key === "I" && list.selected.value.size) {
    e.preventDefault();
    list.markSelected(true);
  } else if (e.key === "U" && list.selected.value.size) {
    e.preventDefault();
    list.markSelected(false);
  } else if (
    e.key === "#" &&
    list.selected.value.size &&
    isEditorOrAbove.value
  ) {
    e.preventDefault();
    list.deleteSelected();
  } else if (e.key === "/") {
    e.preventDefault();
    filterBar.value?.focusSearch();
  } else if (e.key === "?") {
    showHelp.value = true;
  }
}
onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));

// ─── Saved filters ───────────────────────────────────────────────────────────
type InboxRule = Awaited<ReturnType<typeof api.getRules>>[number];
const rules = ref<InboxRule[]>([]);
const ruleModalOpen = ref(false);
const editingRule = ref<InboxRule | null>(null);

async function loadRules() {
  try {
    rules.value = await api.getRules(inboxId);
  } catch {
    rules.value = [];
  }
}
function openRule(rule: InboxRule | null) {
  editingRule.value = rule;
  ruleModalOpen.value = true;
}
async function onRuleSaved() {
  ruleModalOpen.value = false;
  await loadRules();
  if (list.activeRuleId.value) list.applyFilters();
}
function onRuleDeleted(id: string) {
  ruleModalOpen.value = false;
  rules.value = rules.value.filter((r) => r.id !== id);
  if (list.activeRuleId.value === id) list.activeRuleId.value = null;
}

loadRules();
</script>
