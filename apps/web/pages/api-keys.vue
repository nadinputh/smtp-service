<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          API Keys
        </h2>
        <p class="text-sm text-gray-400 dark:text-gray-500">
          Manage programmatic access keys for CI/CD and integrations
        </p>
      </div>
      <button
        @click="showCreateModal = true"
        class="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
      >
        <Icon name="lucide:plus" class="w-4 h-4" /> Create Key
      </button>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="loading" class="text-gray-400">Loading...</div>

      <div v-else-if="!keys.length" class="text-center text-gray-400 py-12">
        <Icon name="lucide:key" class="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No API keys yet</p>
        <p class="text-xs mt-1">
          Create a key to access the API programmatically
        </p>
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
                <th class="px-4 py-3">Key</th>
                <th class="px-4 py-3">Scopes</th>
                <th class="px-4 py-3">Created</th>
                <th class="px-4 py-3">Last Used</th>
                <th class="px-4 py-3">Expires</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="key in keys"
                :key="key.id"
                class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td
                  class="px-4 py-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap"
                >
                  {{ key.name }}
                </td>
                <td class="px-4 py-3">
                  <code class="text-xs text-gray-500 dark:text-gray-400"
                    >{{ key.prefix }}•••••••</code
                  >
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="scope in key.scopes"
                      :key="scope"
                      class="text-xs px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400"
                    >
                      {{ scope }}
                    </span>
                  </div>
                </td>
                <td
                  class="px-4 py-3 text-gray-400 dark:text-gray-500 whitespace-nowrap"
                >
                  {{ formatDate(key.createdAt) }}
                </td>
                <td
                  class="px-4 py-3 text-gray-400 dark:text-gray-500 whitespace-nowrap"
                >
                  {{ key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never" }}
                </td>
                <td
                  class="px-4 py-3 text-gray-400 dark:text-gray-500 whitespace-nowrap"
                >
                  {{ key.expiresAt ? formatDate(key.expiresAt) : "—" }}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    @click="handleDelete(key.id)"
                    class="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- New key display -->
      <div
        v-if="newKey"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="newKey = null"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-md p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2"
          >
            Key Created
          </h2>
          <p class="text-sm text-red-600 mb-3">
            Copy this key now — it won't be shown again.
          </p>
          <div
            class="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-center gap-2"
          >
            <code
              class="text-sm text-gray-800 dark:text-gray-100 flex-1 break-all"
              >{{ newKey }}</code
            >
            <button
              @click="copyKey"
              class="text-indigo-600 hover:text-indigo-800 shrink-0"
            >
              <Icon name="lucide:copy" class="w-4 h-4" />
            </button>
          </div>
          <div class="flex justify-end mt-4">
            <button
              @click="newKey = null"
              class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create API Key Modal -->
    <Teleport to="body">
      <div
        v-if="showCreateModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="showCreateModal = false"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Create API Key
          </h2>
          <form @submit.prevent="handleCreate" class="space-y-4">
            <div>
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >Name</label
              >
              <input
                v-model="form.name"
                type="text"
                required
                placeholder="e.g. CI Pipeline"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >Scopes</label
              >
              <div class="flex flex-wrap gap-3">
                <label
                  v-for="s in allScopes"
                  :key="s"
                  class="flex items-center gap-1.5 text-sm"
                >
                  <input
                    v-model="form.scopes"
                    type="checkbox"
                    :value="s"
                    class="rounded border-gray-300 text-indigo-600"
                  />
                  {{ s }}
                </label>
              </div>
            </div>
            <div>
              <label
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >Expires (optional)</label
              >
              <input
                v-model="form.expiresAt"
                type="date"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <p v-if="createError" class="text-sm text-red-600">
              {{ createError }}
            </p>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                @click="showCreateModal = false"
                class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="creating || !form.scopes.length"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {{ creating ? "Creating..." : "Create" }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "default" });

const api = useApi();
const keys = ref<Awaited<ReturnType<typeof api.getApiKeys>>>([]);
const loading = ref(true);
const showCreateModal = ref(false);
const creating = ref(false);
const createError = ref("");
const newKey = ref<string | null>(null);
const allScopes = ["send", "read", "delete"];

const form = reactive({
  name: "",
  scopes: ["read"] as string[],
  expiresAt: "",
});

onMounted(async () => {
  keys.value = await api.getApiKeys();
  loading.value = false;
});

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function handleCreate() {
  createError.value = "";
  creating.value = true;
  try {
    const result = await api.createApiKey({
      name: form.name,
      scopes: form.scopes,
      expiresAt: form.expiresAt || undefined,
    });
    newKey.value = result.rawKey;
    showCreateModal.value = false;
    form.name = "";
    form.scopes = ["read"];
    form.expiresAt = "";
    keys.value = await api.getApiKeys();
  } catch (e: any) {
    createError.value = e?.data?.error || "Failed to create key";
  } finally {
    creating.value = false;
  }
}

async function handleDelete(keyId: string) {
  if (!confirm("Revoke this API key? This cannot be undone.")) return;
  try {
    await api.deleteApiKey(keyId);
    keys.value = await api.getApiKeys();
  } catch {
    alert("Failed to revoke key");
  }
}

function copyKey() {
  if (newKey.value) navigator.clipboard.writeText(newKey.value);
}
</script>
