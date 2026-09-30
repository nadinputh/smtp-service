<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 py-3 min-h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          API Keys
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Scoped keys for CI/CD and integrations —
          <NuxtLink
            to="/docs"
            class="text-indigo-600 dark:text-indigo-400 underline"
          >
            read the API docs
          </NuxtLink>
        </p>
      </div>
      <UBtn size="sm" class="self-start sm:self-auto" @click="openCreate">
        <Icon name="lucide:plus" class="w-4 h-4" />
        Create key
      </UBtn>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="loading" class="text-sm text-gray-500 dark:text-gray-400">
        Loading...
      </div>

      <div v-else-if="loadError" class="text-center py-16">
        <Icon
          name="lucide:alert-circle"
          class="w-10 h-10 mx-auto mb-3 text-red-500"
        />
        <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Couldn't load API keys
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Something went wrong fetching your keys.
        </p>
        <UBtn size="sm" @click="fetchKeys">Retry</UBtn>
      </div>

      <EmptyState v-else-if="!keys.length" icon="lucide:key" title="No API keys">
        Create a key to send email or read messages from a script or CI job.
        <template #action>
          <UBtn size="sm" @click="openCreate">
            <Icon name="lucide:plus" class="w-4 h-4" />
            Create key
          </UBtn>
        </template>
      </EmptyState>

      <div
        v-else
        class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700"
      >
        <table class="w-full text-sm text-left">
          <thead
            class="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400"
          >
            <tr>
              <th class="px-4 py-3">Name</th>
              <th class="px-4 py-3">Key</th>
              <th class="px-4 py-3">Scopes</th>
              <th class="px-4 py-3">Last used</th>
              <th class="px-4 py-3">Expires</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr
              v-for="k in keys"
              :key="k.id"
              class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <td
                class="px-4 py-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap"
              >
                {{ k.name }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <code class="text-xs text-gray-600 dark:text-gray-400">
                  {{ k.prefix }}…
                </code>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1">
                  <Badge v-for="s in k.scopes" :key="s">{{ s }}</Badge>
                </div>
              </td>
              <td
                class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
              >
                {{ k.lastUsedAt ? formatDate(k.lastUsedAt) : "Never" }}
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <Badge v-if="isExpired(k)" tone="red">Expired</Badge>
                <span v-else class="text-gray-500 dark:text-gray-400">
                  {{ k.expiresAt ? formatDate(k.expiresAt) : "Never" }}
                </span>
              </td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <div class="inline-flex gap-2">
                  <UBtn variant="secondary" size="xs" @click="openEdit(k)">
                    Edit
                  </UBtn>
                  <UBtn variant="secondary" size="xs" @click="rotate(k)">
                    Rotate
                  </UBtn>
                  <UBtn variant="danger" size="xs" @click="revoke(k)">
                    Revoke
                  </UBtn>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create / edit -->
    <Modal
      v-if="showForm"
      :title="editing ? 'Edit API key' : 'Create API key'"
      @close="showForm = false"
    >
      <form @submit.prevent="submitForm">
        <label
          for="key-name"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Name <span class="text-red-500 dark:text-red-400">*</span>
        </label>
        <input
          id="key-name"
          v-model="form.name"
          type="text"
          required
          maxlength="255"
          placeholder="CI pipeline"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-4"
        />

        <fieldset class="mb-4">
          <legend class="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Scopes <span class="text-red-500 dark:text-red-400">*</span>
          </legend>
          <label
            v-for="s in SCOPES"
            :key="s.value"
            class="flex items-start gap-2 py-1.5 cursor-pointer"
          >
            <input
              v-model="form.scopes"
              type="checkbox"
              :value="s.value"
              class="mt-0.5"
            />
            <span class="text-sm">
              <span class="font-medium text-gray-800 dark:text-gray-100">
                {{ s.value }}
              </span>
              <span class="block text-xs text-gray-500 dark:text-gray-400">
                {{ s.description }}
              </span>
            </span>
          </label>
        </fieldset>

        <label
          for="key-expires"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Expires
          <span class="text-gray-500 dark:text-gray-400">(optional)</span>
        </label>
        <div class="flex items-center gap-2 mb-1">
          <input
            id="key-expires"
            v-model="form.expires"
            type="date"
            :min="today"
            class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <UBtn
            v-if="form.expires"
            type="button"
            variant="ghost"
            size="xs"
            @click="form.expires = ''"
          >
            No expiry
          </UBtn>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          The key stops working at the end of this day.
        </p>

        <p
          v-if="formError"
          role="alert"
          class="text-sm text-red-600 dark:text-red-400 mt-3"
        >
          {{ formError }}
        </p>
        <div class="flex justify-end gap-2 mt-4">
          <UBtn type="button" variant="ghost" @click="showForm = false">
            Cancel
          </UBtn>
          <UBtn type="submit" :disabled="saving || !form.scopes.length">
            {{ saving ? "Saving..." : editing ? "Save" : "Create" }}
          </UBtn>
        </div>
      </form>
    </Modal>

    <!-- One-time secret -->
    <Modal
      v-if="secret"
      title="Copy your API key"
      max-width="md"
      :close-on-backdrop="false"
      :closable="false"
      :close-on-escape="false"
    >
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
        <strong>{{ secret.name }}</strong> is ready. This is the only time the
        full key is shown — store it somewhere safe now.
      </p>
      <div
        class="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2"
      >
        <code
          class="flex-1 text-sm break-all text-gray-800 dark:text-gray-100"
          data-testid="raw-key"
        >
          {{ secret.rawKey }}
        </code>
        <CopyButton :text="secret.rawKey" label="API key" />
      </div>
      <template #footer>
        <UBtn data-autofocus @click="secret = null">I've saved it</UBtn>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import type { ApiKey, ApiKeyCreateResponse } from "~/composables/useApi";
import { API_KEY_SCOPE_INFO } from "~/composables/apiDocs";

definePageMeta({ layout: "default" });
useHead({ title: "API Keys" });

const api = useApi();
const toast = useToast();
const { confirm } = useConfirm();

const SCOPES = API_KEY_SCOPE_INFO;

const keys = ref<ApiKey[]>([]);
const loading = ref(true);
const loadError = ref(false);

async function fetchKeys() {
  loading.value = true;
  loadError.value = false;
  try {
    keys.value = await api.getApiKeys();
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(fetchKeys);

// ─── Create / edit ──────────────────────────────────────────
const showForm = ref(false);
const editing = ref<ApiKey | null>(null);
const form = reactive({ name: "", scopes: [] as string[], expires: "" });
const formError = ref("");
const saving = ref(false);

// YYYY-MM-DD in local time.
function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const today = computed(() => localDate(new Date()));

function openCreate() {
  editing.value = null;
  Object.assign(form, { name: "", scopes: ["send"], expires: "" });
  formError.value = "";
  showForm.value = true;
}

function openEdit(k: ApiKey) {
  editing.value = k;
  Object.assign(form, {
    name: k.name,
    scopes: [...k.scopes],
    expires: k.expiresAt ? localDate(new Date(k.expiresAt)) : "",
  });
  formError.value = "";
  showForm.value = true;
}

const endOfDayIso = (date: string) =>
  new Date(`${date}T23:59:59`).toISOString();

async function submitForm() {
  saving.value = true;
  formError.value = "";
  try {
    const name = form.name.trim();
    const scopes = [...form.scopes];
    if (editing.value) {
      const before = editing.value;
      const body: Parameters<typeof api.updateApiKey>[1] = { name, scopes };
      // Untouched expiry is omitted so it isn't re-derived from a rounded date.
      const beforeDate = before.expiresAt
        ? localDate(new Date(before.expiresAt))
        : "";
      if (form.expires !== beforeDate) {
        body.expiresAt = form.expires ? endOfDayIso(form.expires) : null;
      }
      await api.updateApiKey(before.id, body);
      toast.success(`${name} updated`);
    } else {
      secret.value = await api.createApiKey({
        name,
        scopes,
        expiresAt: form.expires ? endOfDayIso(form.expires) : undefined,
      });
    }
    showForm.value = false;
    await fetchKeys();
  } catch (e: any) {
    formError.value = e?.data?.error || "Failed to save API key";
  } finally {
    saving.value = false;
  }
}

// ─── Rotate / revoke ────────────────────────────────────────
const secret = ref<ApiKeyCreateResponse | null>(null);

async function rotate(k: ApiKey) {
  const ok = await confirm({
    title: `Rotate ${k.name}?`,
    message:
      "A new secret replaces the current one. Anything still using the old key stops working immediately.",
    confirmLabel: "Rotate",
    danger: true,
  });
  if (!ok) return;
  try {
    secret.value = await api.rotateApiKey(k.id);
    await fetchKeys();
  } catch (e: any) {
    toast.error(e?.data?.error || "Failed to rotate API key");
  }
}

async function revoke(k: ApiKey) {
  const ok = await confirm({
    title: `Revoke ${k.name}?`,
    message: "Anything using this key stops working immediately.",
    confirmLabel: "Revoke",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteApiKey(k.id);
    toast.success(`${k.name} revoked`);
    await fetchKeys();
  } catch (e: any) {
    toast.error(e?.data?.error || "Failed to revoke API key");
  }
}

// ─── Formatting ─────────────────────────────────────────────
const isExpired = (k: ApiKey) =>
  !!k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
</script>
