type NewEmailHandler = (data: {
  inboxId: string;
  subject: string | null;
  from: string;
}) => void;
type ReadChangedHandler = (data: { inboxId: string }) => void;

// ─── Singleton connection state (client-only) ─────────────
// Shared across all useSSE callers so only one SSE connection is ever open,
// regardless of how many components (layout, pages) call useSSE.
const newEmailHandlers = new Set<NewEmailHandler>();
const readChangedHandlers = new Set<ReadChangedHandler>();
let sseController: AbortController | null = null;
let sseReconnectTimer: ReturnType<typeof setTimeout> | undefined;
let sseWatchdogTimer: ReturnType<typeof setTimeout> | undefined;
// Captured from useRuntimeConfig() on first useSSE() call so that native
// fetch() uses the correct base-prefixed URL (e.g. /admin/smtp/api/events)
// instead of root-relative /api/events which breaks behind a sub-path reverse proxy.
let sseBaseURL = "";

const WATCHDOG_MS = 45_000;

function resetWatchdog() {
  clearTimeout(sseWatchdogTimer);
  sseWatchdogTimer = setTimeout(() => {
    sseController?.abort();
  }, WATCHDOG_MS);
}

async function startSSEConnection(token: string) {
  sseController = new AbortController();
  resetWatchdog();

  try {
    const res = await fetch(`${sseBaseURL}/api/events`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: sseController.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`SSE connection failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      resetWatchdog();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const payload = line.slice(6);
          try {
            const data = JSON.parse(payload);
            if (currentEvent === "read:changed") {
              readChangedHandlers.forEach((h) => h(data));
            } else {
              newEmailHandlers.forEach((h) => h(data));
            }
          } catch {
            // ignore malformed events
          }
          currentEvent = "";
        }
        // SSE comment lines (e.g. ":ping") are intentionally ignored
      }
    }
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      // Unexpected error — fall through to reconnect
    }
  }

  clearTimeout(sseWatchdogTimer);

  // Reconnect if there are still active subscribers
  if (newEmailHandlers.size > 0 || readChangedHandlers.size > 0) {
    const { token: freshToken } = useAuth();
    sseReconnectTimer = setTimeout(
      () => startSSEConnection(freshToken.value ?? ""),
      3000,
    );
  } else {
    sseController = null;
  }
}

export function useSSE(
  onNewEmail: NewEmailHandler,
  onReadChanged?: ReadChangedHandler,
) {
  const { token } = useAuth();

  // Capture the app base URL once (client-only; useRuntimeConfig is available here)
  if (import.meta.client && !sseBaseURL) {
    const config = useRuntimeConfig();
    sseBaseURL = (config.app.baseURL || "").replace(/\/$/, "");
  }

  // Register handlers immediately so they're active before the connection fires
  newEmailHandlers.add(onNewEmail);
  if (onReadChanged) readChangedHandlers.add(onReadChanged);

  onMounted(() => {
    // Start the shared connection only if it isn't already running
    if (!sseController) {
      startSSEConnection(token.value ?? "");
    }
  });

  onUnmounted(() => {
    newEmailHandlers.delete(onNewEmail);
    if (onReadChanged) readChangedHandlers.delete(onReadChanged);

    // Shut down the connection when the last subscriber unmounts
    if (newEmailHandlers.size === 0 && readChangedHandlers.size === 0) {
      clearTimeout(sseReconnectTimer);
      clearTimeout(sseWatchdogTimer);
      sseController?.abort();
      sseController = null;
    }
  });
}
