<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between"
    >
      <div>
        <h1 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Email Templates
        </h1>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Reusable templates with variable substitution
        </p>
      </div>
      <UBtn size="sm" icon="lucide:plus" @click="openCreate">New Template</UBtn>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <InlineError v-if="deleteError" class="mb-4">{{
        deleteError
      }}</InlineError>
      <p
        v-if="loading"
        role="status"
        class="text-sm text-gray-600 dark:text-gray-400"
      >
        Loading…
      </p>
      <EmptyState
        v-else-if="!templateList.length"
        icon="lucide:file-text"
        title="No templates yet"
      >
        Create a template to reuse in your emails.
      </EmptyState>
      <div
        v-else
        class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700"
      >
        <table class="w-full text-sm text-left">
          <caption class="sr-only">
            Email templates
          </caption>
          <thead
            class="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-600 dark:text-gray-400"
          >
            <tr>
              <th scope="col" class="px-4 py-3">Name</th>
              <th scope="col" class="px-4 py-3">Subject</th>
              <th scope="col" class="px-4 py-3">Variables</th>
              <th scope="col" class="px-4 py-3">Updated</th>
              <th scope="col" class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr
              v-for="tpl in templateList"
              :key="tpl.id"
              class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <th
                scope="row"
                class="px-4 py-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap"
              >
                {{ tpl.name }}
              </th>
              <td
                class="px-4 py-3 text-gray-600 dark:text-gray-400 truncate max-w-[200px]"
              >
                {{ tpl.subject || "—" }}
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1">
                  <Badge v-for="v in tpl.variables" :key="v" tone="indigo">{{
                    v
                  }}</Badge>
                  <span
                    v-if="!tpl.variables.length"
                    class="text-gray-600 dark:text-gray-400"
                    >—</span
                  >
                </div>
              </td>
              <td
                class="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap"
              >
                {{ new Date(tpl.updatedAt).toLocaleDateString() }}
              </td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <UBtn
                  variant="ghost"
                  size="xs"
                  :aria-label="`Edit template ${tpl.name}`"
                  @click="openEdit(tpl)"
                >
                  Edit
                </UBtn>
                <UBtn
                  variant="danger"
                  size="xs"
                  class="ml-1"
                  :aria-label="`Delete template ${tpl.name}`"
                  @click="handleDelete(tpl.id)"
                >
                  Delete
                </UBtn>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Modal
      v-if="showModal"
      :title="editingId ? 'Edit Template' : 'Create Template'"
      max-width="xl"
      :close-on-backdrop="false"
      @close="showModal = false"
    >
      <form id="template-form" class="space-y-4" @submit.prevent="handleSave">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              for="template-name"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Name</label
            >
            <input
              id="template-name"
              v-model="form.name"
              required
              placeholder="Template name"
              class="field"
            />
          </div>
          <div>
            <label
              for="template-subject"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Subject</label
            >
            <input
              id="template-subject"
              v-model="form.subject"
              placeholder="Email subject (supports {{variables}})"
              class="field"
            />
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              for="template-html"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >HTML Body</label
            >
            <textarea
              id="template-html"
              v-model="form.html"
              required
              rows="12"
              placeholder="<h1>Hello {{name}}!</h1>"
              class="field font-mono"
            />
          </div>
          <div>
            <span
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Preview</span
            >
            <!-- Rendered in the same sandboxed iframe as received mail, never as page HTML -->
            <MessageHtmlPreview v-if="previewHtml" :html="previewHtml" />
            <p
              v-else
              class="text-sm text-gray-600 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4"
            >
              The rendered HTML appears here as you type.
            </p>
          </div>
        </div>

        <div>
          <label
            for="template-text"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >Plain Text (optional)</label
          >
          <textarea
            id="template-text"
            v-model="form.text"
            rows="4"
            placeholder="Hello {{name}}!"
            class="field font-mono"
          />
        </div>

        <div
          v-if="detectedVars.length"
          class="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
        >
          <span class="font-medium">Detected variables:</span>
          <Badge v-for="v in detectedVars" :key="v" tone="indigo">{{
            `\{\{${v}\}\}`
          }}</Badge>
        </div>

        <InlineError v-if="formError">{{ formError }}</InlineError>
      </form>
      <template #footer>
        <UBtn type="button" variant="ghost" @click="showModal = false"
          >Cancel</UBtn
        >
        <UBtn type="submit" form="template-form" :loading="saving">{{
          saving ? "Saving…" : "Save"
        }}</UBtn>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import type { Template } from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "Templates" });

const api = useApi();
const { confirm: confirmAction } = useConfirm();

const templateList = ref<Template[]>([]);
const loading = ref(true);
const showModal = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const formError = ref("");
const deleteError = ref("");

const form = reactive({
  name: "",
  subject: "",
  html: "",
  text: "",
});

// Debounce the live preview so it doesn't re-render the DOM on every keystroke.
const previewHtml = ref("");
let previewTimeout: ReturnType<typeof setTimeout> | undefined;
watch(
  () => form.html,
  (v) => {
    clearTimeout(previewTimeout);
    previewTimeout = setTimeout(() => {
      previewHtml.value = v;
    }, 200);
  },
);

onUnmounted(() => {
  clearTimeout(previewTimeout);
});

const detectedVars = computed(() => {
  const vars = new Set<string>();
  for (const content of [form.subject, form.html, form.text]) {
    if (!content) continue;
    for (const match of content.matchAll(/\{\{(\w+)\}\}/g)) {
      vars.add(match[1]);
    }
  }
  return [...vars];
});

async function fetchTemplates() {
  loading.value = true;
  try {
    templateList.value = await api.getTemplates();
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  form.name = "";
  form.subject = "";
  form.html = "";
  form.text = "";
  previewHtml.value = "";
  formError.value = "";
  showModal.value = true;
}

function openEdit(tpl: Template) {
  editingId.value = tpl.id;
  form.name = tpl.name;
  form.subject = tpl.subject ?? "";
  form.html = tpl.html;
  form.text = tpl.text ?? "";
  previewHtml.value = tpl.html;
  formError.value = "";
  showModal.value = true;
}

async function handleSave() {
  formError.value = "";
  saving.value = true;
  try {
    if (editingId.value) {
      await api.updateTemplate(editingId.value, {
        name: form.name,
        subject: form.subject || undefined,
        html: form.html,
        text: form.text || undefined,
      });
    } else {
      await api.createTemplate({
        name: form.name,
        subject: form.subject || undefined,
        html: form.html,
        text: form.text || undefined,
      });
    }
    showModal.value = false;
    await fetchTemplates();
  } catch (e: any) {
    formError.value = e?.data?.error || "Failed to save template";
  } finally {
    saving.value = false;
  }
}

async function handleDelete(id: string) {
  const ok = await confirmAction({
    title: "Delete this template?",
    message: "This template will be permanently deleted.",
    confirmLabel: "Delete template",
    danger: true,
  });
  if (!ok) return;
  deleteError.value = "";
  try {
    await api.deleteTemplate(id);
    await fetchTemplates();
  } catch (e: any) {
    deleteError.value = e?.data?.error || "Failed to delete template";
  }
}

onMounted(fetchTemplates);
</script>
