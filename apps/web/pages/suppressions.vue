<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Suppression List
        </h2>
        <p class="text-sm text-gray-400 dark:text-gray-500">
          Blocked addresses that won't receive emails
        </p>
      </div>
      <button
        @click="showAddModal = true"
        class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
      >
        <Icon name="lucide:plus" class="w-4 h-4" />
        Add Address
      </button>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <!-- Search -->
      <div class="mb-4">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by email..."
          class="w-full max-w-sm px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div v-if="loading" class="text-sm text-gray-400">Loading...</div>
      <div
        v-else-if="!data?.suppressions.length"
        class="text-center py-16 text-gray-400"
      >
        <Icon name="lucide:shield-check" class="w-12 h-12 mx-auto mb-3" />
        <p class="text-lg font-medium">No suppressed addresses</p>
        <p class="text-sm">
          Hard-bounced addresses are automatically suppressed.
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
                <th class="px-4 py-3">Email</th>
                <th class="px-4 py-3">Reason</th>
                <th class="px-4 py-3">Source</th>
                <th class="px-4 py-3">Date</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="item in data.suppressions"
                :key="item.id"
                class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td
                  class="px-4 py-3 text-gray-800 dark:text-gray-100 whitespace-nowrap"
                >
                  {{ item.email }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                  <span
                    class="px-2 py-0.5 rounded-full text-xs font-medium"
                    :class="{
                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400':
                        item.reason === 'hard_bounce',
                      'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400':
                        item.reason === 'complaint',
                      'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400':
                        item.reason === 'manual',
                    }"
                  >
                    {{ item.reason }}
                  </span>
                </td>
                <td
                  class="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs font-mono"
                >
                  {{ item.source || "—" }}
                </td>
                <td
                  class="px-4 py-3 text-gray-400 dark:text-gray-500 whitespace-nowrap"
                >
                  {{ new Date(item.createdAt).toLocaleDateString() }}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    @click="handleRemove(item.id)"
                    class="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div
          v-if="data.total > data.limit"
          class="flex items-center justify-between mt-4"
        >
          <span class="text-sm text-gray-500">
            Showing {{ (data.page - 1) * data.limit + 1 }}–{{
              Math.min(data.page * data.limit, data.total)
            }}
            of {{ data.total }}
          </span>
          <div class="flex gap-2">
            <button
              :disabled="currentPage <= 1"
              @click="currentPage--"
              class="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 dark:text-gray-300 rounded-lg disabled:opacity-40"
            >
              Prev
            </button>
            <button
              :disabled="currentPage * (data?.limit ?? 50) >= data.total"
              @click="currentPage++"
              class="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 dark:text-gray-300 rounded-lg disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Modal -->
    <Teleport to="body">
      <div
        v-if="showAddModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="showAddModal = false"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Suppress Address
          </h2>
          <form @submit.prevent="handleAdd">
            <input
              v-model="addEmail"
              type="email"
              required
              placeholder="email@example.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p v-if="addError" class="text-sm text-red-600 mt-2">
              {{ addError }}
            </p>
            <div class="flex justify-end gap-2 mt-4">
              <button
                type="button"
                @click="showAddModal = false"
                class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="adding"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {{ adding ? "Adding..." : "Suppress" }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { PaginatedSuppressions } from "~/composables/useApi";

definePageMeta({ layout: "default" });

const api = useApi();

const data = ref<PaginatedSuppressions | null>(null);
const loading = ref(true);
const searchQuery = ref("");
const currentPage = ref(1);
const showAddModal = ref(false);
const addEmail = ref("");
const adding = ref(false);
const addError = ref("");

let searchTimeout: ReturnType<typeof setTimeout>;

async function fetchSuppressions() {
  loading.value = true;
  try {
    data.value = await api.getSuppressions({
      q: searchQuery.value || undefined,
      page: currentPage.value,
    });
  } finally {
    loading.value = false;
  }
}

watch(searchQuery, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentPage.value = 1;
    fetchSuppressions();
  }, 300);
});

watch(currentPage, () => fetchSuppressions());

async function handleAdd() {
  addError.value = "";
  adding.value = true;
  try {
    await api.addSuppression(addEmail.value);
    showAddModal.value = false;
    addEmail.value = "";
    await fetchSuppressions();
  } catch (e: any) {
    addError.value = e?.data?.error || "Failed to add suppression";
  } finally {
    adding.value = false;
  }
}

async function handleRemove(id: string) {
  if (!confirm("Remove this address from the suppression list?")) return;
  try {
    await api.removeSuppression(id);
    await fetchSuppressions();
  } catch (e: any) {
    alert(e?.data?.error || "Failed to remove suppression");
  }
}

onMounted(fetchSuppressions);
</script>
