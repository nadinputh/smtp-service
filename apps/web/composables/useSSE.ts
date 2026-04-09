export function useSSE(
  onNewEmail: (data: {
    inboxId: string;
    subject: string | null;
    from: string;
  }) => void,
) {
  let eventSource: EventSource | null = null;

  function connect() {
    eventSource = new EventSource("/api/events");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onNewEmail(data);
      } catch {
        // ignore malformed events
      }
    };

    eventSource.onerror = () => {
      eventSource?.close();
      // Reconnect after 3 seconds
      setTimeout(connect, 3000);
    };
  }

  onMounted(connect);

  onUnmounted(() => {
    eventSource?.close();
  });
}
