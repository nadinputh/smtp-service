// The inbox message list: URL-mirrored filters, paging, read state, selection and
// bulk actions, and live updates. The page and its components only render this.
import type { PaginatedMessages } from "./useApi";

type Msg = PaginatedMessages["messages"][number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const queryStr = (v: unknown) => (typeof v === "string" ? v : "");

export function useInboxMessages(inboxId: string) {
  const route = useRoute();
  const router = useRouter();
  const api = useApi();
  const toast = useToast();
  const { confirm } = useConfirm();
  const listNav = useListNav();

  // ─── Filters (mirrored in the URL) ─────────────────────────────────────────
  const searchQuery = ref(queryStr(route.query.q));
  const filterStatus = ref(queryStr(route.query.status));
  const filterAfter = ref(queryStr(route.query.after));
  const filterBefore = ref(queryStr(route.query.before));
  const activeRuleId = ref<string | null>(
    UUID_RE.test(queryStr(route.query.rule))
      ? queryStr(route.query.rule)
      : null,
  );
  const currentPage = ref(
    Math.max(1, parseInt(queryStr(route.query.page), 10) || 1),
  );

  // What the list shows, as URL params: survives reloads and lets the message
  // page send you back to exactly this list.
  const listQuery = computed(() => {
    const q: Record<string, string> = {};
    if (searchQuery.value) q.q = searchQuery.value;
    if (filterStatus.value) q.status = filterStatus.value;
    if (filterAfter.value) q.after = filterAfter.value;
    if (filterBefore.value) q.before = filterBefore.value;
    if (activeRuleId.value) q.rule = activeRuleId.value;
    if (currentPage.value > 1) q.page = String(currentPage.value);
    return q;
  });
  watch(listQuery, (q) => router.replace({ query: q }));

  const hasAdvancedFilters = computed(
    () => !!filterStatus.value || !!filterAfter.value || !!filterBefore.value,
  );
  const hasActiveFilters = computed(
    () =>
      !!searchQuery.value || hasAdvancedFilters.value || !!activeRuleId.value,
  );

  /** The filters as API params. */
  const filterParams = () => ({
    q: searchQuery.value || undefined,
    status: filterStatus.value || undefined,
    after: filterAfter.value || undefined,
    before: filterBefore.value || undefined,
    ruleId: activeRuleId.value || undefined,
  });

  // ─── Messages ──────────────────────────────────────────────────────────────
  const messages = ref<Msg[]>([]);
  const totalMessages = ref(0);
  const totalUnread = ref(0);
  const attentionTotal = ref(0);
  const pending = ref(false);
  const fetchError = ref(false);
  const totalPages = computed(() =>
    Math.max(1, Math.ceil(totalMessages.value / INBOX_PAGE_SIZE)),
  );
  const pageUnreadIds = computed(() =>
    messages.value.filter((m) => !m.isRead).map((m) => m.id),
  );

  // Only the latest request may write results; older, slower ones are dropped.
  let fetchSeq = 0;
  async function loadMessages({ silent = false } = {}) {
    const seq = ++fetchSeq;
    if (!silent) {
      pending.value = true;
      fetchError.value = false;
    }
    try {
      const res = await api.getInboxMessages(inboxId, {
        ...filterParams(),
        page: currentPage.value,
        limit: INBOX_PAGE_SIZE,
      });
      if (seq !== fetchSeq) return;
      messages.value = res.messages;
      totalMessages.value = res.total;
      totalUnread.value = res.unreadTotal;
      attentionTotal.value = res.attentionTotal;
      fetchError.value = false;
      // A page-level selection only makes sense for rows still on screen;
      // a "select all matching" selection intentionally spans pages.
      if (!allMatching.value) {
        const onPage = new Set(res.messages.map((m) => m.id));
        selected.value = new Set(
          [...selected.value].filter((id) => onPage.has(id)),
        );
      }
      listNav.value = {
        inboxId,
        ids: res.messages.map((m) => m.id),
        page: currentPage.value,
        totalPages: Math.max(1, Math.ceil(res.total / INBOX_PAGE_SIZE)),
      };
    } catch {
      if (seq === fetchSeq) fetchError.value = true;
    } finally {
      if (seq === fetchSeq) pending.value = false;
    }
  }

  // Changing any filter goes back to page 1 (which loads via the page watcher
  // when it actually changes).
  function applyFilters() {
    clearSelection();
    if (currentPage.value !== 1) currentPage.value = 1;
    else loadMessages();
  }

  let searchTimeout: ReturnType<typeof setTimeout>;
  watch(searchQuery, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(applyFilters, 300);
  });
  watch([filterStatus, filterAfter, filterBefore, activeRuleId], applyFilters);
  const scrollToTop = ref<() => void>(() => {});
  watch(currentPage, () => {
    loadMessages();
    scrollToTop.value();
  });

  function clearFilters() {
    searchQuery.value = "";
    filterStatus.value = "";
    filterAfter.value = "";
    filterBefore.value = "";
    activeRuleId.value = null;
  }

  /** Optimistic only — the message page's watcher makes the actual API call. */
  function markOpened(msg: Msg) {
    if (!msg.isRead) {
      msg.isRead = true;
      totalUnread.value = Math.max(0, totalUnread.value - 1);
    }
  }

  // ─── Read state ────────────────────────────────────────────────────────────
  const togglingReadIds = ref(new Set<string>());
  async function toggleRead(msg: Msg) {
    if (togglingReadIds.value.has(msg.id)) return;
    const wasRead = msg.isRead;
    msg.isRead = !wasRead;
    totalUnread.value = wasRead
      ? totalUnread.value + 1
      : Math.max(0, totalUnread.value - 1);
    togglingReadIds.value.add(msg.id);
    try {
      if (wasRead) await api.markMessageUnread(msg.id);
      else await api.markMessageRead(msg.id);
    } catch {
      msg.isRead = wasRead;
      totalUnread.value = wasRead
        ? Math.max(0, totalUnread.value - 1)
        : totalUnread.value + 1;
      toast.error("Couldn't update the read status.");
    } finally {
      togglingReadIds.value.delete(msg.id);
    }
  }

  const markingAllRead = ref(false);
  /** An unfiltered single page marks the whole inbox; otherwise the unread rows on screen. */
  async function markPageRead() {
    if (markingAllRead.value) return;
    markingAllRead.value = true;
    try {
      const ids = pageUnreadIds.value;
      if (!hasActiveFilters.value && totalPages.value === 1) {
        await api.markAllRead(inboxId);
        totalUnread.value = 0;
      } else {
        await api.batchMarkRead(inboxId, ids, true);
        totalUnread.value = Math.max(0, totalUnread.value - ids.length);
      }
      messages.value.forEach((m) => (m.isRead = true));
      toast.success("Marked as read");
    } catch {
      toast.error("Couldn't mark messages as read.");
    } finally {
      markingAllRead.value = false;
    }
  }

  // ─── Selection & bulk actions ──────────────────────────────────────────────
  const selected = ref(new Set<string>());
  /** True when the selection was extended to every match, beyond the current page. */
  const allMatching = ref(false);
  const selectingAll = ref(false);
  let lastChecked = -1;

  function clearSelection() {
    selected.value = new Set();
    allMatching.value = false;
  }

  function toggleSelected(id: string, index: number, shift = false) {
    allMatching.value = false;
    const next = new Set(selected.value);
    const checking = !next.has(id);
    const range =
      shift && lastChecked >= 0
        ? [lastChecked, index].sort((a, b) => a - b)
        : [index, index];
    for (let i = range[0]; i <= range[1]; i++) {
      const rowId = messages.value[i].id;
      if (checking) next.add(rowId);
      else next.delete(rowId);
    }
    selected.value = next;
    lastChecked = index;
  }

  function selectPage() {
    allMatching.value = false;
    selected.value = new Set(messages.value.map((m) => m.id));
  }

  /** How many matches "select all" can reach (the API caps bulk requests). */
  const BULK_MAX = 1000;
  const matchingReachable = computed(() =>
    Math.min(totalMessages.value, BULK_MAX),
  );
  const canSelectAllMatching = computed(
    () =>
      !allMatching.value &&
      messages.value.length > 0 &&
      selected.value.size === messages.value.length &&
      totalMessages.value > messages.value.length,
  );
  async function selectAllMatching() {
    selectingAll.value = true;
    try {
      const ids = await api.getInboxMessageIds(inboxId, filterParams());
      selected.value = new Set(ids);
      allMatching.value = true;
    } catch {
      toast.error("Couldn't select all matching messages.");
    } finally {
      selectingAll.value = false;
    }
  }

  async function markSelected(isRead: boolean) {
    const ids = [...selected.value];
    if (!ids.length) return;
    try {
      await api.batchMarkRead(inboxId, ids, isRead);
      toast.success(`Marked ${ids.length} as ${isRead ? "read" : "unread"}`);
      clearSelection();
      await loadMessages({ silent: true });
    } catch {
      toast.error("Couldn't update the selected messages.");
    }
  }

  async function deleteSelected() {
    const ids = [...selected.value];
    if (!ids.length) return;
    const ok = await confirm({
      title: `Delete ${ids.length} message${ids.length === 1 ? "" : "s"}?`,
      message: "They'll be permanently deleted. This can't be undone.",
      confirmLabel: `Delete ${ids.length}`,
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await api.deleteMessages(inboxId, ids);
      clearSelection();
      toast.success(
        `Deleted ${res.deleted} message${res.deleted === 1 ? "" : "s"}`,
      );
      await loadMessages();
      // Deleting the last rows of a page leaves it empty — step back a page
      if (!messages.value.length && currentPage.value > 1) currentPage.value--;
    } catch {
      toast.error("Couldn't delete the selected messages.");
    }
  }

  // ─── Real-time updates ─────────────────────────────────────────────────────
  // A burst of arrivals triggers one refetch and one toast, not one per message.
  let refreshTimeout: ReturnType<typeof setTimeout>;
  function scheduleRefresh() {
    clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => loadMessages({ silent: true }), 400);
  }

  let notifyTimeout: ReturnType<typeof setTimeout>;
  let arrivals: { from: string; subject: string | null }[] = [];
  function notifyArrival(a: { from: string; subject: string | null }) {
    arrivals.push(a);
    clearTimeout(notifyTimeout);
    notifyTimeout = setTimeout(() => {
      const first = arrivals[0];
      toast.info(
        arrivals.length === 1
          ? `New email from ${first.from}${first.subject ? ` — ${first.subject}` : ""}`
          : `${arrivals.length} new emails`,
      );
      arrivals = [];
    }, 800);
  }

  useSSE(
    (data) => {
      if (data.inboxId !== inboxId) return;
      scheduleRefresh();
      notifyArrival({ from: data.from, subject: data.subject });
    },
    (data) => {
      if (data.inboxId !== inboxId) return;
      if (data.allRead) {
        messages.value.forEach((m) => (m.isRead = true));
        totalUnread.value = 0;
      } else if (data.messageId !== undefined && data.isRead !== undefined) {
        const msg = messages.value.find((m) => m.id === data.messageId);
        if (msg && msg.isRead !== data.isRead) {
          msg.isRead = data.isRead;
          totalUnread.value = data.isRead
            ? Math.max(0, totalUnread.value - 1)
            : totalUnread.value + 1;
        }
      } else if (data.messageIds && data.isRead !== undefined) {
        const ids = new Set(data.messageIds);
        messages.value.forEach((m) => {
          if (ids.has(m.id) && m.isRead !== data.isRead) {
            m.isRead = data.isRead!;
            totalUnread.value = data.isRead
              ? Math.max(0, totalUnread.value - 1)
              : totalUnread.value + 1;
          }
        });
      } else {
        scheduleRefresh();
      }
    },
  );

  onUnmounted(() => {
    clearTimeout(searchTimeout);
    clearTimeout(refreshTimeout);
    clearTimeout(notifyTimeout);
  });

  loadMessages();

  return {
    // filters
    searchQuery,
    filterStatus,
    filterAfter,
    filterBefore,
    activeRuleId,
    currentPage,
    listQuery,
    hasAdvancedFilters,
    hasActiveFilters,
    clearFilters,
    applyFilters,
    // list
    messages,
    totalMessages,
    totalUnread,
    attentionTotal,
    totalPages,
    pageUnreadIds,
    pending,
    fetchError,
    loadMessages,
    scrollToTop,
    markOpened,
    // read state
    togglingReadIds,
    toggleRead,
    markingAllRead,
    markPageRead,
    // selection
    selected,
    allMatching,
    selectingAll,
    clearSelection,
    toggleSelected,
    selectPage,
    canSelectAllMatching,
    matchingReachable,
    selectAllMatching,
    markSelected,
    deleteSelected,
  };
}
