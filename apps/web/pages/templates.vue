<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Email Templates
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Reusable templates with variable substitution
        </p>
      </div>
      <UBtn size="sm" @click="openCreate">
        <Icon name="lucide:plus" class="w-4 h-4" />
        New Template
      </UBtn>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <p
        v-if="deleteError"
        role="alert"
        class="text-sm text-red-600 dark:text-red-400 mb-4"
      >
        {{ deleteError }}
      </p>
      <div v-if="loading" class="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      <div
        v-else-if="!templateList.length"
        class="text-center py-16 text-gray-500 dark:text-gray-400"
      >
        <Icon name="lucide:file-text" class="w-12 h-12 mx-auto mb-3" />
        <p class="text-lg font-medium">No templates yet</p>
        <p class="text-sm">Create a template to reuse in your emails.</p>
      </div>
      <div v-else>
        <div
          class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <table class="w-full text-sm text-left">
            <thead
              class="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400"
            >
              <tr>
                <th class="px-4 py-3">Name</th>
                <th class="px-4 py-3">Subject</th>
                <th class="px-4 py-3">Variables</th>
                <th class="px-4 py-3">Updated</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="tpl in templateList"
                :key="tpl.id"
                class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td
                  class="px-4 py-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap"
                >
                  {{ tpl.name }}
                </td>
                <td
                  class="px-4 py-3 text-gray-500 dark:text-gray-400 truncate max-w-[200px]"
                >
                  {{ tpl.subject || "—" }}
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="v in tpl.variables"
                      :key="v"
                      class="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"
                    >
                      {{ v }}
                    </span>
                    <span
                      v-if="!tpl.variables.length"
                      class="text-gray-500 dark:text-gray-400"
                      >—</span
                    >
                  </div>
                </td>
                <td
                  class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
                >
                  {{ new Date(tpl.updatedAt).toLocaleDateString() }}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <UBtn
                    variant="ghost"
                    size="xs"
                    class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                    @click="openEdit(tpl)"
                  >
                    Edit
                  </UBtn>
                  <UBtn
                    variant="danger"
                    size="xs"
                    class="ml-1"
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
    </div>

    <!-- Create/Edit Modal -->
    <Teleport to="body">
      <div
        v-if="showModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
        @click.self="showModal = false"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            {{ editingId ? "Edit Template" : "Create Template" }}
          </h2>
          <form @submit.prevent="handleSave" class="space-y-4">
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
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <!-- HTML editor -->
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
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <!-- Preview -->
              <div>
                <span
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >Preview</span
                >
                <div
                  class="w-full h-[282px] border border-gray-300 dark:border-gray-600 rounded-lg overflow-auto bg-white dark:bg-gray-700 p-3"
                  v-html="previewHtml"
                />
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
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <!-- Detected variables -->
            <div v-if="detectedVars.length" class="text-sm text-gray-500">
              <span class="font-medium">Detected variables:</span>
              <span
                v-for="v in detectedVars"
                :key="v"
                class="ml-2 inline-block bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded text-xs"
                v-text="`\{\{${v}\}\}`"
              />
            </div>

            <p
              v-if="formError"
              role="alert"
              class="text-sm text-red-600 dark:text-red-400"
            >
              {{ formError }}
            </p>

            <div class="flex justify-end gap-2">
              <UBtn type="button" variant="ghost" @click="showModal = false">
                Cancel
              </UBtn>
              <UBtn type="submit" :disabled="saving">
                {{ saving ? "Saving..." : "Save" }}
              </UBtn>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { Template } from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "Templates" });

const api = useApi();

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
  if (!confirm("Delete this template?")) return;
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
