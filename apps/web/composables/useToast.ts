import { ref } from "vue";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  duration: number;
  /** Hovered or focused: the dismiss timer and progress bar are held. */
  paused?: boolean;
}

const toasts = ref<Toast[]>([]);
let nextId = 0;
const timers = new Map<
  number,
  { timer: ReturnType<typeof setTimeout>; started: number; remaining: number }
>();

export function useToast() {
  function dismiss(id: number) {
    clearTimeout(timers.get(id)?.timer);
    timers.delete(id);
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function schedule(id: number, ms: number) {
    timers.set(id, {
      timer: setTimeout(() => dismiss(id), ms),
      started: Date.now(),
      remaining: ms,
    });
  }

  // Hovering or focusing a toast holds it so it can be read at your own pace.
  function pause(id: number) {
    const t = timers.get(id);
    const toast = toasts.value.find((x) => x.id === id);
    if (!t || !toast || toast.paused) return;
    clearTimeout(t.timer);
    t.remaining -= Date.now() - t.started;
    toast.paused = true;
  }

  function resume(id: number) {
    const t = timers.get(id);
    const toast = toasts.value.find((x) => x.id === id);
    if (!t || !toast?.paused) return;
    toast.paused = false;
    schedule(id, Math.max(t.remaining, 1000));
  }

  function show(
    message: string,
    type: Toast["type"] = "info",
    duration = 3000,
  ) {
    const id = nextId++;
    toasts.value.push({ id, message, type, duration });
    schedule(id, duration);
  }

  return {
    toasts,
    dismiss,
    pause,
    resume,
    success: (msg: string) => show(msg, "success"),
    error: (msg: string) => show(msg, "error", 4000),
    info: (msg: string) => show(msg, "info"),
  };
}
