<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 py-3 min-h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          API Docs
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Send and read email from your own code with an API key
        </p>
      </div>
      <UBtn
        to="/api-keys"
        variant="secondary"
        size="sm"
        class="self-start sm:self-auto"
      >
        <Icon name="lucide:key" class="w-4 h-4" />
        API Keys
      </UBtn>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div class="max-w-3xl space-y-8 text-sm text-gray-700 dark:text-gray-300">
        <section aria-labelledby="docs-auth">
          <h3 id="docs-auth" class="docs-h">Authentication</h3>
          <p class="mb-3">
            <NuxtLink to="/api-keys" class="link">Create a key</NuxtLink>, then
            send it on every request as a bearer token or an
            <code>X-API-Key</code> header. Base URL:
            <code>{{ baseUrl }}</code>
          </p>
          <div class="docs-code">
            <pre>{{ authExample }}</pre>
            <CopyButton :text="authExample" label="example" />
          </div>
          <p class="mt-3">
            Keys are for integrations. Managing keys, signing in and admin
            routes need a user session and return 403 for a key. A key acts as
            its owner, so it reaches every inbox you can.
          </p>
        </section>

        <section aria-labelledby="docs-send">
          <h3 id="docs-send" class="docs-h">Send an email</h3>
          <p class="mb-3">
            Needs the <Badge>send</Badge> scope. The
            <code>from</code> address must use a verified domain, and
            <code>inboxId</code> is the inbox that records the message.
          </p>
          <div class="mb-2">
            <SegmentedControl
              v-model="lang"
              label="Code sample language"
              :options="LANGS"
            />
          </div>
          <div class="docs-code">
            <pre>{{ sendExamples[lang] }}</pre>
            <CopyButton :text="sendExamples[lang]" label="example" />
          </div>
          <p class="mt-3">
            Success returns <code>202</code> with
            <code>{ id, status, message }</code>, plus
            <code>suppressed</code> when some recipients were skipped.
          </p>
          <table class="docs-table mt-3">
            <thead>
              <tr>
                <th>Field</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in SEND_FIELDS" :key="f[0]">
                <td>
                  <code>{{ f[0] }}</code>
                </td>
                <td>{{ f[1] }}</td>
              </tr>
            </tbody>
          </table>
          <p class="mt-3">
            <code>/v1/messages/mime</code> takes the same fields as multipart
            form fields (<code>from</code>, <code>to</code>, <code>cc</code>,
            <code>bcc</code>, <code>subject</code>, <code>text</code>,
            <code>html</code>, <code>inboxId</code>) plus file parts for
            attachments. <code>/v1/messages/batch</code> takes
            <code>from</code>, <code>subject</code>, <code>inboxId</code>, a
            <code>templateId</code> or <code>html</code>/<code>text</code>, and
            <code>recipients: [{ to, variables? }]</code> (max 1000). It returns
            <code>{ batchId, messageIds, count }</code>.
          </p>
        </section>

        <section aria-labelledby="docs-read">
          <h3 id="docs-read" class="docs-h">Read messages</h3>
          <p class="mb-3">
            Needs the <Badge>read</Badge> scope.
          </p>
          <div class="docs-code">
            <pre>{{ readExample }}</pre>
            <CopyButton :text="readExample" label="example" />
          </div>
        </section>

        <section aria-labelledby="docs-endpoints">
          <h3 id="docs-endpoints" class="docs-h">Endpoints</h3>
          <div
            class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <table class="docs-table">
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th>Scope</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="e in API_ENDPOINTS" :key="e.method + e.path">
                  <td class="whitespace-nowrap">
                    <span class="font-semibold">{{ e.method }}</span>
                    <code class="ml-1">{{ e.path }}</code>
                  </td>
                  <td>
                    <Badge>{{ e.scope }}</Badge>
                  </td>
                  <td>{{ e.summary }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="docs-errors">
          <h3 id="docs-errors" class="docs-h">Errors and limits</h3>
          <div
            class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 mb-3"
          >
            <table class="docs-table">
              <tbody>
                <tr v-for="e in API_ERRORS" :key="e.status">
                  <td class="font-semibold">{{ e.status }}</td>
                  <td>{{ e.meaning }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Sending is limited to 30 requests a minute (batch: 10), and every
            recipient counts against your monthly quota. A key that is
            <NuxtLink to="/api-keys" class="link">rotated, revoked</NuxtLink>
            or expired stops working immediately, and changing your password
            revokes all keys.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  API_ENDPOINTS,
  API_ERRORS,
} from "~/composables/apiDocs";

definePageMeta({ layout: "default" });
useHead({ title: "API Docs" });

const LANGS = [
  { value: "curl" as const, label: "curl" },
  { value: "node" as const, label: "Node.js" },
  { value: "python" as const, label: "Python" },
];
const lang = ref<"curl" | "node" | "python">("curl");

const SEND_FIELDS = [
  ["from, to, inboxId", "Required. to, cc and bcc take an address or an array."],
  ["subject", "Required unless a template supplies it."],
  ["text, html", "At least one, or use a template."],
  ["templateId, variables", "Render a template; {{name}} placeholders take values from variables."],
  ["sendAt", "ISO 8601 time in the future to schedule delivery."],
  ["headers", "Custom headers. Only X-* names are allowed."],
];

// window is only touched on the client (the app is a client-rendered SPA).
const baseUrl = computed(() => {
  const base = useRuntimeConfig().app.baseURL.replace(/\/$/, "");
  return `${window.location.origin}${base}`;
});

const authExample = computed(
  () => `curl ${baseUrl.value}/api/inboxes \\
  -H "Authorization: Bearer smtps_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`,
);

const KEY = "smtps_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const sendExamples = computed(() => {
  const url = `${baseUrl.value}/v1/messages`;
  return {
    curl: `curl -X POST ${url} \\
  -H "Authorization: Bearer ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "hello@yourdomain.com",
    "to": "user@example.com",
    "subject": "Welcome",
    "html": "<p>Hello!</p>",
    "inboxId": "<inbox-id>"
  }'`,
    node: `const res = await fetch("${url}", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${KEY}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from: "hello@yourdomain.com",
    to: "user@example.com",
    subject: "Welcome",
    html: "<p>Hello!</p>",
    inboxId: "<inbox-id>",
  }),
});
console.log(res.status, await res.json()); // 202 { id, status, message }`,
    python: `import requests

res = requests.post(
    "${url}",
    headers={"Authorization": "Bearer ${KEY}"},
    json={
        "from": "hello@yourdomain.com",
        "to": "user@example.com",
        "subject": "Welcome",
        "html": "<p>Hello!</p>",
        "inboxId": "<inbox-id>",
    },
)
print(res.status_code, res.json())  # 202 {id, status, message}`,
  };
});

const readExample = computed(
  () => `curl "${baseUrl.value}/api/inboxes/<inbox-id>/messages?limit=20" \\
  -H "Authorization: Bearer ${KEY}"`,
);
</script>

<style scoped>
.docs-h {
  @apply text-base font-semibold text-gray-800 dark:text-gray-100 mb-2;
}
.docs-code {
  @apply relative rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 pr-12 overflow-x-auto;
}
.docs-code pre {
  @apply text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre;
}
.docs-code :deep(.icon-btn) {
  @apply absolute top-2 right-2;
}
.docs-table {
  @apply w-full text-left;
}
.docs-table th {
  @apply px-4 py-2 text-xs uppercase bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400;
}
.docs-table td {
  @apply px-4 py-2 align-top border-t border-gray-200 dark:border-gray-700;
}
code {
  @apply text-xs font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded;
}
.docs-code pre code {
  @apply bg-transparent p-0;
}
.link {
  @apply text-indigo-600 dark:text-indigo-400 underline;
}
</style>
