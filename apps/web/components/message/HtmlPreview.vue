<script setup lang="ts">
// Renders an email's HTML in a sandboxed iframe, with a light / simulated-dark
// toggle, and turns link clicks into a "here's where it goes" bar.
const props = defineProps<{ html: string }>();

// Always defaults to "light" regardless of the dashboard theme: the preview
// approximates how the email renders for recipients, not for the viewer.
const previewBg = ref<"light" | "dark">("light");
const modes = [
  { value: "light", label: "Light", icon: "lucide:sun" },
  {
    value: "dark",
    label: "Simulate dark mode",
    icon: "lucide:moon",
    title:
      "Approximates how some email clients auto-invert colors in dark mode. This is a simulation, not the actual email rendering.",
  },
];

// Strip <script> blocks and inline event handlers before rendering in the
// sandboxed iframe (defence-in-depth — the sandbox already blocks scripts).
// Every <a href> becomes "#" with the real destination in data-original-href:
// a link left to navigate the iframe itself could land on this app's own SPA
// routes (e.g. a password-reset link) and blank the preview with no way back.
// handleLoad() below intercepts the click and shows the real URL instead.
function sanitize(raw: string): { headExtra: string; bodyHtml: string } {
  const doc = new DOMParser().parseFromString(raw, "text/html");
  doc.querySelectorAll("script").forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (attr.name.toLowerCase().startsWith("on"))
        el.removeAttribute(attr.name);
    }
  });
  doc.querySelectorAll("a[href]").forEach((el) => {
    el.setAttribute("data-original-href", el.getAttribute("href") || "");
    el.setAttribute("href", "#");
  });
  const headExtra = [...doc.head.querySelectorAll("style")]
    .map((el) => el.outerHTML)
    .join("");
  return { headExtra, bodyHtml: doc.body.innerHTML };
}

const srcdoc = computed(() => {
  const { headExtra, bodyHtml } = sanitize(props.html);
  if (previewBg.value === "dark") {
    // Outlook-style dark mode: invert the whole document, then counter-invert
    // raster media. body{color} is explicit because color-scheme:dark alone
    // flips unset text to white, which would match the white html background
    // and — invert() being uniform — stay identical after it (1:1 contrast).
    const darkStyle = [
      ":root{color-scheme:dark}",
      "body{color:#1f2937}",
      "html{filter:invert(1) hue-rotate(180deg);background:#ffffff}",
      "img,video,canvas,iframe{filter:invert(1) hue-rotate(180deg)}",
    ].join("");
    return `<html><head><meta name="color-scheme" content="dark"><style>${darkStyle}</style>${headExtra}</head><body style="margin:0">${bodyHtml}</body></html>`;
  }
  return `<html><head><style>html{background:#ffffff}body{margin:0;color:#1f2937}</style>${headExtra}</head><body>${bodyHtml}</body></html>`;
});

// The unsandboxed parent may attach a listener inside a same-origin sandboxed
// iframe (allow-same-origin); that doesn't need allow-scripts, which only
// gates script declared inside the sandboxed document.
const clickedLink = ref<string | null>(null);

function handleLoad(e: Event) {
  clickedLink.value = null;
  const doc = (e.target as HTMLIFrameElement).contentDocument;
  if (!doc) return;
  doc.addEventListener(
    "click",
    (ev) => {
      const link = (ev.target as HTMLElement)?.closest?.(
        "a[data-original-href]",
      );
      if (!link) return;
      ev.preventDefault();
      clickedLink.value = link.getAttribute("data-original-href");
    },
    true,
  );
}
</script>

<template>
  <div
    class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
  >
    <div
      class="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
    >
      <span class="text-xs text-gray-600 dark:text-gray-400">
        HTML preview
        <span class="hidden sm:inline"
          >· independent of your dashboard theme</span
        >
      </span>
      <SegmentedControl
        :model-value="previewBg"
        :options="modes"
        label="Preview mode"
        @update:model-value="previewBg = $event === 'dark' ? 'dark' : 'light'"
      />
    </div>
    <div
      v-if="clickedLink"
      role="status"
      class="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 text-sm"
    >
      <Icon
        name="lucide:link"
        class="w-4 h-4 shrink-0 text-indigo-700 dark:text-indigo-300"
      />
      <span class="text-gray-700 dark:text-gray-300 shrink-0">Link:</span>
      <code
        class="flex-1 min-w-0 truncate text-gray-800 dark:text-gray-200"
        :title="clickedLink"
        >{{ clickedLink }}</code
      >
      <CopyButton :text="clickedLink" label="link" />
      <UBtn
        :to="clickedLink"
        variant="ghost"
        size="xs"
        icon="lucide:external-link"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open
      </UBtn>
      <button
        type="button"
        aria-label="Dismiss link"
        class="icon-btn shrink-0"
        @click="clickedLink = null"
      >
        <Icon name="lucide:x" class="w-4 h-4" />
      </button>
    </div>
    <div
      class="ring-1 ring-inset ring-gray-200/60 dark:ring-gray-700/60 transition-colors"
      :class="previewBg === 'dark' ? 'bg-gray-900' : 'bg-white'"
    >
      <iframe
        :srcdoc="srcdoc"
        title="Email HTML preview"
        class="w-full min-h-[calc(100vh-300px)] border-0"
        sandbox="allow-same-origin"
        @load="handleLoad"
      />
    </div>
  </div>
</template>
