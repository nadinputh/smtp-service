<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col justify-center"
    >
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
        Send Email
      </h2>
      <p class="text-sm text-gray-400 dark:text-gray-500">
        Compose and send via the HTTP API
      </p>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <form @submit.prevent="handleSend" class="max-w-2xl space-y-4">
        <!-- Inbox selector -->
        <div>
          <label
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >Sending Inbox</label
          >
          <select
            v-model="form.inboxId"
            required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="" disabled>Select an inbox</option>
            <option v-for="inbox in inboxes" :key="inbox.id" :value="inbox.id">
              {{ inbox.name }}
            </option>
          </select>
        </div>

        <!-- Template selector -->
        <div>
          <label
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Template
            <span class="text-gray-400 dark:text-gray-500 font-normal"
              >(optional)</span
            >
          </label>
          <select
            v-model="form.templateId"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">None — compose manually</option>
            <option v-for="tpl in templatesList" :key="tpl.id" :value="tpl.id">
              {{ tpl.name }}
              <template v-if="tpl.variables.length">
                ({{ tpl.variables.join(", ") }})
              </template>
            </option>
          </select>
        </div>

        <!-- Template variables -->
        <div v-if="selectedTemplate?.variables.length" class="space-y-2">
          <label
            class="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Template Variables
          </label>
          <div class="grid grid-cols-2 gap-2">
            <div v-for="varName in selectedTemplate.variables" :key="varName">
              <label
                class="block text-xs text-gray-500 dark:text-gray-400 mb-0.5"
                v-text="`\{\{${varName}\}\}`"
              />
              <input
                v-model="templateVars[varName]"
                :placeholder="varName"
                class="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >From</label
            >
            <input
              v-model="form.from"
              type="email"
              required
              placeholder="sender@yourdomain.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >To</label
            >
            <input
              v-model="form.to"
              type="text"
              required
              placeholder="recipient@example.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p class="text-xs text-gray-400 mt-0.5">
              Comma-separated for multiple recipients
            </p>
          </div>
        </div>

        <div>
          <label
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >Subject</label
          >
          <input
            v-model="form.subject"
            type="text"
            :required="!form.templateId"
            placeholder="Email subject"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <!-- Body tabs (hidden when using template) -->
        <div v-if="!form.templateId">
          <div class="flex gap-2 mb-2">
            <button
              type="button"
              class="text-sm px-3 py-1 rounded-md transition-colors"
              :class="
                bodyTab === 'html'
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
              @click="bodyTab = 'html'"
            >
              HTML
            </button>
            <button
              type="button"
              class="text-sm px-3 py-1 rounded-md transition-colors"
              :class="
                bodyTab === 'text'
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
              @click="bodyTab = 'text'"
            >
              Plain Text
            </button>
          </div>
          <textarea
            v-if="bodyTab === 'html'"
            v-model="form.html"
            rows="10"
            placeholder="<h1>Hello!</h1><p>Your email content here...</p>"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <textarea
            v-else
            v-model="form.text"
            rows="10"
            placeholder="Plain text content..."
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <!-- Schedule -->
        <div>
          <label
            class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            <input v-model="useSchedule" type="checkbox" class="rounded" />
            Schedule for later
          </label>
          <input
            v-if="useSchedule"
            v-model="form.sendAt"
            type="datetime-local"
            class="mt-2 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <!-- Custom Headers -->
        <div>
          <button
            type="button"
            @click="showHeaders = !showHeaders"
            class="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <Icon
              :name="
                showHeaders ? 'lucide:chevron-down' : 'lucide:chevron-right'
              "
              class="w-4 h-4"
            />
            Custom Headers
          </button>
          <div v-if="showHeaders" class="mt-2 space-y-2">
            <div
              v-for="(header, i) in customHeaders"
              :key="i"
              class="flex gap-2"
            >
              <input
                v-model="header.key"
                placeholder="X-Custom-Tag"
                class="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                v-model="header.value"
                placeholder="value"
                class="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                @click="customHeaders.splice(i, 1)"
                class="text-red-400 hover:text-red-600"
              >
                <Icon name="lucide:x" class="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              @click="customHeaders.push({ key: '', value: '' })"
              class="text-sm text-indigo-600 hover:text-indigo-800"
            >
              + Add header
            </button>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <UBtn type="submit" :disabled="sending">
            <Icon
              :name="useSchedule ? 'lucide:clock' : 'lucide:send'"
              class="w-4 h-4"
            />
            {{
              sending ? "Sending..." : useSchedule ? "Schedule" : "Send Email"
            }}
          </UBtn>
          <p v-if="sendError" class="text-sm text-red-600">{{ sendError }}</p>
        </div>

        <!-- Result -->
        <div
          v-if="sendResult"
          class="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4 text-sm"
        >
          <p class="text-green-800 font-medium">
            {{
              sendResult.status === "scheduled"
                ? "Email scheduled!"
                : "Email queued for delivery!"
            }}
          </p>
          <p class="text-green-600 mt-1">
            Message ID: <code>{{ sendResult.id }}</code>
          </p>
          <p v-if="sendResult.suppressed?.length" class="text-orange-600 mt-1">
            Suppressed recipients: {{ sendResult.suppressed.join(", ") }}
          </p>
          <NuxtLink
            v-if="form.inboxId"
            :to="`/inbox/${form.inboxId}/message/${sendResult.id}`"
            class="text-indigo-600 hover:text-indigo-800 text-xs mt-1 inline-block"
          >
            View message →
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Template } from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "Send Email" });

const api = useApi();

const { data: inboxes } = useAsyncData("inboxes", () => api.getInboxes());

const templatesList = ref<Template[]>([]);
onMounted(async () => {
  try {
    templatesList.value = await api.getTemplates();
  } catch {}
});

const selectedTemplate = computed(() =>
  templatesList.value.find((t) => t.id === form.templateId),
);

const bodyTab = ref<"html" | "text">("html");
const sending = ref(false);
const sendError = ref("");
const sendResult = ref<{
  id: string;
  status: string;
  suppressed?: string[];
} | null>(null);
const useSchedule = ref(false);
const showHeaders = ref(false);
const customHeaders = reactive<Array<{ key: string; value: string }>>([]);
const templateVars = reactive<Record<string, string>>({});

const form = reactive({
  inboxId: "",
  from: "",
  to: "",
  subject: "",
  html: "",
  text: "",
  templateId: "",
  sendAt: "",
});

// Reset template vars when template changes
watch(
  () => form.templateId,
  () => {
    Object.keys(templateVars).forEach((k) => delete templateVars[k]);
  },
);

async function handleSend() {
  sendError.value = "";
  sendResult.value = null;
  sending.value = true;
  try {
    const toList = form.to
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Build custom headers object
    const headers: Record<string, string> = {};
    for (const h of customHeaders) {
      if (h.key && h.value) headers[h.key] = h.value;
    }

    // Build sendAt
    let sendAt: string | undefined;
    if (useSchedule.value && form.sendAt) {
      sendAt = new Date(form.sendAt).toISOString();
    }

    const res = await api.sendEmail({
      inboxId: form.inboxId,
      from: form.from,
      to: toList,
      subject: form.subject || undefined,
      html: form.html || undefined,
      text: form.text || undefined,
      templateId: form.templateId || undefined,
      variables:
        Object.keys(templateVars).length > 0 ? { ...templateVars } : undefined,
      sendAt,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });
    sendResult.value = res;
  } catch (e: any) {
    sendError.value = e?.data?.error || "Failed to send email";
  } finally {
    sending.value = false;
  }
}
</script>
