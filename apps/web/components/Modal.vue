<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      @click.self="handleBackdropClick"
    >
      <div
        ref="dialogRef"
        tabindex="-1"
        class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full p-6 focus:outline-none"
        :class="maxWidth === 'md' ? 'max-w-md' : 'max-w-sm'"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        @keydown="handleKeydown"
      >
        <h2
          v-if="title"
          :id="titleId"
          class="text-lg font-semibold text-gray-800 dark:text-gray-100"
          :class="titleClass"
        >
          {{ title }}
        </h2>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title?: string;
    maxWidth?: "sm" | "md";
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    titleClass?: string;
  }>(),
  {
    maxWidth: "sm",
    closeOnBackdrop: true,
    closeOnEscape: true,
    titleClass: "mb-4",
  },
);

const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const dialogRef = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(): HTMLElement[] {
  if (!dialogRef.value) return [];
  return Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => el.offsetParent !== null);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (props.closeOnEscape) emit("close");
    return;
  }
  if (e.key !== "Tab") return;
  const focusables = focusableElements();
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  // The dialog container itself (tabindex="-1") is also a possible
  // activeElement — the neutral landing spot ensureFocusInsideDialog uses
  // when it can't tell what should come next. Treat Tab/Shift+Tab from
  // there the same as from the edges, so it can't fall through to the
  // browser's default DOM-order tabbing and escape the dialog.
  const onContainer = document.activeElement === dialogRef.value;
  if (e.shiftKey && (document.activeElement === first || onContainer)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (document.activeElement === last || onContainer)) {
    e.preventDefault();
    first.focus();
  }
}

function handleBackdropClick() {
  if (props.closeOnBackdrop) emit("close");
}

// A reactive update (e.g. clicking an autocomplete result, or triggering a
// confirmation panel that replaces the button just clicked) can remove the
// currently-focused element from the DOM. Per spec this does NOT dispatch a
// focus/focusin event — the browser silently falls back to <body> as
// document.activeElement — so a focusin listener never sees it happen.
// A MutationObserver does: it fires on the DOM removal itself, at which
// point we check whether focus has landed outside the dialog and pull it
// back in before the next keypress (Escape/Tab) is lost to it.
let observer: MutationObserver | null = null;

function ensureFocusInsideDialog() {
  if (!dialogRef.value) return;
  if (!dialogRef.value.contains(document.activeElement)) {
    // Don't guess "the first field" — whatever got removed may have been
    // replaced by something the user needs to read first (a confirmation
    // panel, a newly-revealed input), and silently redirecting into an
    // unrelated field lets further keystrokes land somewhere the user
    // doesn't expect. The dialog container itself (tabindex="-1") is a
    // neutral landing spot: it keeps Tab/Escape working and re-orients
    // assistive tech without writing into anything.
    dialogRef.value.focus();
  }
}

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  nextTick(() => {
    focusableElements()[0]?.focus();
  });
  if (dialogRef.value) {
    observer = new MutationObserver(ensureFocusInsideDialog);
    observer.observe(dialogRef.value, { childList: true, subtree: true });
  }
});

onUnmounted(() => {
  observer?.disconnect();
  previouslyFocused?.focus?.();
});
</script>
