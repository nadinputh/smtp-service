export const INBOX_PAGE_SIZE = 50;

/** Query-string keys that describe what the inbox list is showing. */
export const LIST_QUERY_KEYS = [
  "q",
  "status",
  "after",
  "before",
  "rule",
  "page",
];

export interface ListNav {
  inboxId: string;
  ids: string[];
  page: number;
  totalPages: number;
}

/** The list's current page of message ids, shared with the message page for prev/next. */
export function useListNav() {
  return useState<ListNav>("inbox-list-nav", () => ({
    inboxId: "",
    ids: [],
    page: 1,
    totalPages: 1,
  }));
}

/** The message last opened from the list, so coming back lands on that row. */
export function useLastOpened() {
  return useState("inbox-last-opened", () => ({ inboxId: "", messageId: "" }));
}

const SHORTCUTS_KEY = "shortcuts";

/** Single-key shortcuts can be switched off (WCAG 2.1.4); the choice persists per browser. */
export function useShortcutsEnabled() {
  const enabled = useState(
    "shortcuts-enabled",
    () => localStorage.getItem(SHORTCUTS_KEY) !== "off",
  );
  watch(enabled, (on) =>
    localStorage.setItem(SHORTCUTS_KEY, on ? "on" : "off"),
  );
  return enabled;
}

/** True when the key press should be left alone (shortcuts off, typing, or a dialog is open). */
export function shouldIgnoreHotkey(e: KeyboardEvent): boolean {
  if (localStorage.getItem(SHORTCUTS_KEY) === "off") return true;
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const el = e.target as HTMLElement | null;
  if (
    el &&
    (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
  )
    return true;
  return !!document.querySelector('[role="dialog"], [role="alertdialog"]');
}
