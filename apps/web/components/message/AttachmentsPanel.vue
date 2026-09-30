<script setup lang="ts">
type Att = {
  filename: string;
  contentType: string;
  size: number;
  storageKey: string;
};

const props = defineProps<{ messageId: string; attachments: Att[] }>();

const {
  apiBase,
  error: downloadError,
  download,
  fetchBlob,
} = useAuthedDownload();

const THUMB_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);
const isImage = (a: Att) => IMAGE_TYPES.has(a.contentType);
const isPdf = (a: Att) => a.contentType === "application/pdf";
const isText = (a: Att) =>
  a.contentType.startsWith("text/") ||
  a.contentType === "application/json" ||
  a.contentType === "application/xml";
const isPreviewable = (a: Att) => isImage(a) || isPdf(a) || isText(a);

const entries = computed(() =>
  props.attachments.map((att, idx) => ({ att, idx })),
);
const images = computed(() => entries.value.filter((e) => isImage(e.att)));
const others = computed(() => entries.value.filter((e) => !isImage(e.att)));
const totalBytes = computed(() =>
  props.attachments.reduce((n, a) => n + a.size, 0),
);

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const url = (idx: number) =>
  `${apiBase}/api/messages/${props.messageId}/attachments/${idx}`;

// Blob URLs (auth header required). The server serves non-allowlisted types as
// octet-stream, so images and PDFs are re-typed from their declared type; they
// render in image/frame elements, which never run script.
const blobUrls = ref<Record<number, string>>({});
const blobFailed = ref<Record<number, boolean>>({});

async function ensureBlob(idx: number) {
  if (blobUrls.value[idx]) return;
  const att = props.attachments[idx];
  const blob = await fetchBlob(
    url(idx),
    isImage(att) || isPdf(att) ? att.contentType : undefined,
  );
  blobUrls.value[idx] = URL.createObjectURL(blob);
}

onMounted(() => {
  for (const { att, idx } of images.value) {
    if (att.size > THUMB_MAX_BYTES) continue;
    ensureBlob(idx).catch(() => (blobFailed.value[idx] = true));
  }
});
onUnmounted(() => Object.values(blobUrls.value).forEach(URL.revokeObjectURL));

// ── Preview modal ──
const previewIdx = ref<number | null>(null);
const previewText = ref("");
const previewLoading = ref(false);
const previewError = ref("");

watch(previewIdx, async (idx) => {
  previewError.value = "";
  previewText.value = "";
  if (idx === null) return;
  const att = props.attachments[idx];
  previewLoading.value = true;
  try {
    if (isText(att))
      previewText.value = await (await fetchBlob(url(idx))).text();
    else if (isImage(att) || isPdf(att)) await ensureBlob(idx);
  } catch (e: any) {
    previewError.value = e?.message
      ? `Couldn't load the preview: ${e.message}`
      : "Couldn't load the preview.";
  } finally {
    previewLoading.value = false;
  }
});

const current = computed(() =>
  previewIdx.value === null ? null : props.attachments[previewIdx.value],
);
</script>

<template>
  <div>
    <InlineError v-if="downloadError" class="mb-3">{{
      downloadError
    }}</InlineError>
    <EmptyState
      v-if="!attachments.length"
      icon="lucide:paperclip"
      title="No attachments"
      compact
    />
    <template v-else>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {{ attachments.length }} file{{ attachments.length === 1 ? "" : "s" }} ·
        {{ bytes(totalBytes) }}
      </p>

      <div v-if="images.length" class="mb-6">
        <h2
          class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3"
        >
          Images
        </h2>
        <ul class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <li v-for="{ att, idx } in images" :key="idx">
            <button
              type="button"
              :aria-label="`Preview ${att.filename}`"
              class="w-full text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              @click="previewIdx = idx"
            >
              <img
                v-if="blobUrls[idx]"
                :src="blobUrls[idx]"
                alt=""
                class="w-full h-32 object-cover"
                loading="lazy"
              />
              <div
                v-else
                class="w-full h-32 flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              >
                <Icon
                  :name="
                    blobFailed[idx] || att.size > THUMB_MAX_BYTES
                      ? 'lucide:image-off'
                      : 'lucide:image'
                  "
                  class="w-8 h-8"
                />
              </div>
              <div class="p-2">
                <p
                  class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate"
                  :title="att.filename"
                >
                  {{ att.filename }}
                </p>
                <p class="text-xs text-gray-600 dark:text-gray-400">
                  {{ bytes(att.size) }}
                </p>
              </div>
            </button>
          </li>
        </ul>
      </div>

      <h2
        v-if="images.length && others.length"
        class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3"
      >
        Other files
      </h2>
      <ul class="space-y-2">
        <li
          v-for="{ att, idx } in images.length ? others : entries"
          :key="idx"
          class="flex flex-wrap items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <Icon
            name="lucide:paperclip"
            class="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1 basis-40">
            <p
              class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate"
              :title="att.filename"
            >
              {{ att.filename }}
            </p>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              {{ att.contentType }} · {{ bytes(att.size) }}
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <UBtn
              v-if="isPreviewable(att)"
              variant="secondary"
              size="xs"
              :aria-label="`Preview ${att.filename}`"
              @click="previewIdx = idx"
              >Preview</UBtn
            >
            <UBtn
              variant="secondary"
              size="xs"
              :aria-label="`Download ${att.filename}`"
              @click="download(url(idx), att.filename)"
              >Download</UBtn
            >
          </div>
        </li>
      </ul>
    </template>

    <Modal
      v-if="current && previewIdx !== null"
      :title="current.filename"
      max-width="xl"
      @close="previewIdx = null"
    >
      <InlineError v-if="previewError" class="py-8 justify-center">{{
        previewError
      }}</InlineError>
      <p
        v-else-if="previewLoading"
        role="status"
        class="text-sm text-gray-600 dark:text-gray-400 py-8 text-center"
      >
        Loading preview…
      </p>
      <template v-else>
        <img
          v-if="isImage(current)"
          :src="blobUrls[previewIdx]"
          :alt="current.filename"
          class="max-w-full mx-auto"
        />
        <iframe
          v-else-if="isPdf(current)"
          :src="blobUrls[previewIdx]"
          title="PDF attachment preview"
          class="w-full h-[70vh] border-0"
        />
        <pre
          v-else-if="isText(current)"
          tabindex="0"
          class="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300 font-mono bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-[70vh] overflow-auto"
          >{{ previewText }}</pre>
        <EmptyState
          v-else
          icon="lucide:file"
          title="Preview not available for this file type"
          compact
        />
      </template>
      <template #footer>
        <UBtn
          variant="secondary"
          size="sm"
          @click="download(url(previewIdx), current.filename)"
          >Download</UBtn
        >
        <UBtn variant="ghost" size="sm" @click="previewIdx = null">Close</UBtn>
      </template>
    </Modal>
  </div>
</template>
