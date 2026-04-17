export function useSSE(
  onNewEmail: (data: {
    inboxId: string;
    subject: string | null;
    from: string;
  }) => void,
  onReadChanged?: (data: { inboxId: string }) => void,
) {
  const { token } = useAuth();
  let controller: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  async function connect() {
    controller = new AbortController();

    try {
      const res = await fetch("/api/events", {
        headers: token.value ? { Authorization: `Bearer ${token.value}` } : {},
        signal: controller.signal,
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
                onReadChanged?.(data);
              } else {
                onNewEmail(data);
              }
            } catch {
              // ignore malformed events
            }
            currentEvent = "";
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
    }

    // Reconnect after 3 seconds
    reconnectTimer = setTimeout(connect, 3000);
  }

  onMounted(connect);

  onUnmounted(() => {
    clearTimeout(reconnectTimer);
    controller?.abort();
  });
}
