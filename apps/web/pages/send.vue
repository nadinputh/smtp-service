<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col justify-center"
    >
      <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
        Send Email
      </h2>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Compose and send via the HTTP API
      </p>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <form @submit.prevent="handleSend" class="max-w-2xl space-y-4">
        <!-- Inbox selector -->
        <div>
          <label
            for="send-inbox"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >Sending Inbox</label
          >
          <select
            id="send-inbox"
            v-model="form.inboxId"
            required
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="" disabled>Select an inbox</option>
            <option
              v-for="inbox in inboxes ?? []"
              :key="inbox.id"
              :value="inbox.id"
              :disabled="inbox.currentUserRole === 'viewer'"
            >
              {{ inbox.name
              }}{{ inbox.currentUserRole === "viewer" ? " (view only)" : "" }}
            </option>
          </select>
        </div>

        <!-- Template selector -->
        <div>
          <label
            for="send-template"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Template
            <span class="text-gray-500 dark:text-gray-400 font-normal"
              >(optional)</span
            >
          </label>
          <select
            id="send-template"
            v-model="form.templateId"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">None — compose manually</option>
            <option v-for="tpl in templatesList" :key="tpl.id" :value="tpl.id">
              {{ tpl.name }}
            </option>
          </select>
          <p
            v-if="templatesError"
            role="alert"
            aria-live="assertive"
            class="text-xs text-red-600 dark:text-red-400 mt-1"
          >
            Couldn't load templates. You can still compose manually.
          </p>
        </div>

        <!-- Template variables -->
        <div v-if="selectedTemplate?.variables.length" class="space-y-2">
          <label
            class="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Template Variables
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div v-for="varName in selectedTemplate.variables" :key="varName">
              <label
                :for="`send-var-${varName}`"
                class="block text-xs text-gray-500 dark:text-gray-400 mb-0.5"
                v-text="`\{\{${varName}\}\}`"
              />
              <input
                :id="`send-var-${varName}`"
                v-model="templateVars[varName]"
                :placeholder="varName"
                class="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              for="send-from"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >From</label
            >
            <input
              id="send-from"
              v-model="form.from"
              type="email"
              required
              placeholder="sender@yourdomain.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label
              for="send-to"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >To</label
            >
            <input
              id="send-to"
              v-model="form.to"
              type="text"
              required
              placeholder="recipient@example.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Comma-separated for multiple recipients
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              for="send-cc"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >CC
              <span class="text-gray-500 dark:text-gray-400 font-normal">(optional)</span></label
            >
            <input
              id="send-cc"
              v-model="form.cc"
              type="text"
              placeholder="cc@example.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Comma-separated</p>
          </div>
          <div>
            <label
              for="send-bcc"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >BCC
              <span class="text-gray-500 dark:text-gray-400 font-normal">(optional)</span></label
            >
            <input
              id="send-bcc"
              v-model="form.bcc"
              type="text"
              placeholder="bcc@example.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Comma-separated</p>
          </div>
        </div>

        <p
          v-if="validationError"
          role="alert"
          aria-live="assertive"
          class="text-sm text-red-600 dark:text-red-400"
        >
          {{ validationError }}
        </p>

        <div>
          <label
            for="send-subject"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >Subject</label
          >
          <input
            id="send-subject"
            v-model="form.subject"
            type="text"
            :required="!form.templateId"
            placeholder="Email subject"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <!-- Body tabs (hidden when using template) -->
        <div v-if="!form.templateId">
          <div role="tablist" aria-label="Email body format" class="flex gap-2 mb-2">
            <button
              id="send-tab-html"
              type="button"
              role="tab"
              :aria-selected="bodyTab === 'html'"
              aria-controls="send-body-html"
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
              id="send-tab-text"
              type="button"
              role="tab"
              :aria-selected="bodyTab === 'text'"
              aria-controls="send-body-text"
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
          <div
            v-if="bodyTab === 'html'"
            class="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <textarea
              id="send-body-html"
              v-model="form.html"
              role="tabpanel"
              aria-labelledby="send-tab-html"
              rows="10"
              placeholder="<h1>Hello!</h1><p>Your email content here...</p>"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <div>
              <span
                class="block text-xs text-gray-500 dark:text-gray-400 mb-1"
                >Preview</span
              >
              <div
                class="w-full h-[236px] border border-gray-300 dark:border-gray-600 rounded-lg overflow-auto bg-white dark:bg-gray-700 p-3 text-sm"
                v-html="previewHtml"
              />
            </div>
          </div>
          <textarea
            v-else
            id="send-body-text"
            v-model="form.text"
            role="tabpanel"
            aria-labelledby="send-tab-text"
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
            :min="minScheduleValue"
            class="mt-2 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <!-- Custom Headers -->
        <div>
          <button
            type="button"
            @click="showHeaders = !showHeaders"
            :aria-expanded="showHeaders"
            aria-controls="send-custom-headers-panel"
            class="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1"
          >
            <Icon
              :name="
                showHeaders ? 'lucide:chevron-down' : 'lucide:chevron-right'
              "
              class="w-4 h-4"
            />
            Custom Headers
          </button>
          <div
            id="send-custom-headers-panel"
            v-show="showHeaders"
            class="mt-2 space-y-2"
          >
            <div
              v-for="(header, i) in customHeaders"
              :key="i"
              class="flex gap-2"
            >
              <input
                v-model="header.key"
                :aria-label="`Header ${i + 1} name`"
                placeholder="X-Custom-Tag"
                class="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                v-model="header.value"
                :aria-label="`Header ${i + 1} value`"
                placeholder="value"
                class="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                @click="customHeaders.splice(i, 1)"
                :aria-label="`Remove header ${i + 1}`"
                class="relative text-red-400 hover:text-red-600 before:absolute before:content-[''] before:-top-3.5 before:-bottom-3.5 before:-left-1 before:-right-3.5"
              >
                <Icon name="lucide:x" class="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              @click="customHeaders.push({ key: '', value: '' })"
              class="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
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
          <p
            v-if="sendError"
            role="alert"
            aria-live="assertive"
            class="text-sm text-red-600 dark:text-red-400"
          >
            {{ sendError }}
          </p>
        </div>

        <!-- Result -->
        <div
          v-if="sendResult"
          role="status"
          aria-live="polite"
          class="rounded-lg p-4 text-sm border"
          :class="
            sendResult.suppressed?.length
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
              : 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800'
          "
        >
          <p
            class="font-medium"
            :class="
              sendResult.suppressed?.length
                ? 'text-amber-800 dark:text-amber-300'
                : 'text-green-800 dark:text-green-300'
            "
          >
            {{
              sendResult.status === "scheduled"
                ? "Email scheduled!"
                : "Email queued for delivery!"
            }}
          </p>
          <p
            class="mt-1"
            :class="
              sendResult.suppressed?.length
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-green-600 dark:text-green-400'
            "
          >
            Message ID: <code>{{ sendResult.id }}</code>
          </p>
          <p
            v-if="sendResult.suppressed?.length"
            class="text-amber-800 dark:text-amber-300 font-medium mt-1"
          >
            Suppressed recipients: {{ sendResult.suppressed.join(", ") }}
          </p>
          <NuxtLink
            v-if="form.inboxId"
            :to="`/inbox/${form.inboxId}/message/${sendResult.id}`"
            class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-xs mt-1 inline-block"
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

const { data: inboxes } = useAsyncData("send-inboxes", () => api.getInboxes(), {
  server: false,
});

const templatesList = ref<Template[]>([]);
const templatesError = ref(false);
onMounted(async () => {
  try {
    templatesList.value = await api.getTemplates();
  } catch {
    templatesError.value = true;
  }
});

const selectedTemplate = computed(() =>
  templatesList.value.find((t) => t.id === form.templateId),
);

const bodyTab = ref<"html" | "text">("html");
const sending = ref(false);
const sendError = ref("");
const validationError = ref("");
const sendResult = ref<{
  id: string;
  status: string;
  suppressed?: string[];
} | null>(null);
const useSchedule = ref(false);
const showHeaders = ref(false);
const customHeaders = reactive<Array<{ key: string; value: string }>>([]);
const templateVars = reactive<Record<string, string>>({});
const toast = useToast();

const form = reactive({
  inboxId: "",
  from: "",
  to: "",
  cc: "",
  bcc: "",
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

// Floor for "Schedule for later" — set once at mount so users can't pick a
// past send time; doesn't need per-second precision.
const minScheduleValue = computed(() => {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
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
  { immediate: true },
);
onUnmounted(() => clearTimeout(previewTimeout));

function parseEmailList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function invalidEmails(list: string[]): string[] {
  return list.filter((e) => !EMAIL_RE.test(e));
}

async function handleSend() {
  sendError.value = "";
  validationError.value = "";
  sendResult.value = null;

  const toList = parseEmailList(form.to);
  const ccList = parseEmailList(form.cc);
  const bccList = parseEmailList(form.bcc);

  const badTo = invalidEmails(toList);
  const badCc = invalidEmails(ccList);
  const badBcc = invalidEmails(bccList);

  const problems: string[] = [];
  if (!toList.length) problems.push("To needs at least one recipient.");
  if (badTo.length) problems.push(`Invalid To address: ${badTo.join(", ")}.`);
  if (badCc.length) problems.push(`Invalid CC address: ${badCc.join(", ")}.`);
  if (badBcc.length)
    problems.push(`Invalid BCC address: ${badBcc.join(", ")}.`);
  if (problems.length) {
    validationError.value = problems.join(" ");
    toast.error(validationError.value);
    return;
  }

  // Build custom headers object; reject header injection via embedded newlines.
  const headers: Record<string, string> = {};
  for (const h of customHeaders) {
    if (!h.key && !h.value) continue;
    if (/[\r\n]/.test(h.key) || /[\r\n]/.test(h.value)) {
      validationError.value = "Custom header values cannot contain line breaks.";
      toast.error(validationError.value);
      return;
    }
    if (h.key && h.value) headers[h.key] = h.value;
  }

  // Build sendAt
  let sendAt: string | undefined;
  if (useSchedule.value && form.sendAt) {
    sendAt = new Date(form.sendAt).toISOString();
  }

  const recipientCount = toList.length + ccList.length + bccList.length;
  const confirmMessage = sendAt
    ? `Schedule this email from ${form.from} to ${recipientCount} recipient(s) for ${new Date(sendAt).toLocaleString()}?`
    : `Send this email now from ${form.from} to ${recipientCount} recipient(s)?`;
  if (!confirm(confirmMessage)) return;

  sending.value = true;
  try {
    const res = await api.sendEmail({
      inboxId: form.inboxId,
      from: form.from,
      to: toList,
      cc: ccList.length ? ccList : undefined,
      bcc: bccList.length ? bccList : undefined,
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
    toast.success(sendAt ? "Email scheduled" : "Email queued for delivery");
  } catch (e: any) {
    const baseError = e?.data?.error || "Failed to send email";
    const suppressedEmails: string[] | undefined = e?.data?.suppressedEmails;
    sendError.value = suppressedEmails?.length
      ? `${baseError}: ${suppressedEmails.join(", ")}`
      : baseError;
    toast.error(sendError.value);
  } finally {
    sending.value = false;
  }
}
</script>
