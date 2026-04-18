import { ref } from "vue";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  duration: number;
}

const toasts = ref<Toast[]>([]);
let nextId = 0;

export function useToast() {
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function show(
    message: string,
    type: Toast["type"] = "info",
    duration = 3000,
  ) {
    const id = nextId++;
    toasts.value.push({ id, message, type, duration });
    setTimeout(() => dismiss(id), duration);
  }

  return {
    toasts,
    dismiss,
    success: (msg: string) => show(msg, "success"),
    error: (msg: string) => show(msg, "error", 4000),
    info: (msg: string) => show(msg, "info"),
  };
}
