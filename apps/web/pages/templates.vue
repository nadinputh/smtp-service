<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Email Templates
        </h2>
        <p class="text-sm text-gray-400 dark:text-gray-500">
          Reusable templates with variable substitution
        </p>
      </div>
      <button
        @click="openCreate"
        class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
      >
        <Icon name="lucide:plus" class="w-4 h-4" />
        New Template
      </button>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="loading" class="text-sm text-gray-400">Loading...</div>
      <div
        v-else-if="!templateList.length"
        class="text-center py-16 text-gray-400"
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
                      class="text-gray-400 dark:text-gray-500"
                      >—</span
                    >
                  </div>
                </td>
                <td
                  class="px-4 py-3 text-gray-400 dark:text-gray-500 whitespace-nowrap"
                >
                  {{ new Date(tpl.updatedAt).toLocaleDateString() }}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    @click="openEdit(tpl)"
                    class="px-3 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    @click="handleDelete(tpl.id)"
                    class="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-1"
                  >
                    Delete
                  </button>
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
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
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
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >Name</label
                >
                <input
                  v-model="form.name"
                  required
                  placeholder="Template name"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >Subject</label
                >
                <input
                  v-model="form.subject"
                  placeholder="Email subject (supports {{variables}})"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <!-- HTML editor -->
              <div>
                <label
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >HTML Body</label
                >
                <textarea
                  v-model="form.html"
                  required
                  rows="12"
                  placeholder="<h1>Hello {{name}}!</h1>"
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <!-- Preview -->
              <div>
                <label
                  class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >Preview</label
                >
                <div
                  class="w-full h-[282px] border border-gray-300 dark:border-gray-600 rounded-lg overflow-auto bg-white dark:bg-gray-700 p-3"
                  v-html="form.html"
                />
              </div>
            </div>

            <div>
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >Plain Text (optional)</label
              >
              <textarea
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

            <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>

            <div class="flex justify-end gap-2">
              <button
                type="button"
                @click="showModal = false"
                class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="saving"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {{ saving ? "Saving..." : "Save" }}
              </button>
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

const api = useApi();

const templateList = ref<Template[]>([]);
const loading = ref(true);
const showModal = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const formError = ref("");

const form = reactive({
  name: "",
  subject: "",
  html: "",
  text: "",
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
  formError.value = "";
  showModal.value = true;
}

function openEdit(tpl: Template) {
  editingId.value = tpl.id;
  form.name = tpl.name;
  form.subject = tpl.subject ?? "";
  form.html = tpl.html;
  form.text = tpl.text ?? "";
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
  try {
    await api.deleteTemplate(id);
    await fetchTemplates();
  } catch (e: any) {
    alert(e?.data?.error || "Failed to delete template");
  }
}

onMounted(fetchTemplates);
</script>
