<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 py-3 min-h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Suppressions
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Addresses that won't receive email — hard bounces are added
          automatically
        </p>
      </div>
      <UBtn size="sm" class="self-start sm:self-auto" @click="openAddModal">
        <Icon name="lucide:plus" class="w-4 h-4" />
        Add address
      </UBtn>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div class="mb-4">
        <input
          v-model="search"
          type="text"
          placeholder="Search by email..."
          aria-label="Search suppressed addresses"
          class="w-full max-w-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          @input="debouncedFetch"
        />
      </div>

      <div v-if="loading" class="text-sm text-gray-500 dark:text-gray-400">
        Loading...
      </div>

      <div v-else-if="loadError" class="text-center py-16">
        <Icon
          name="lucide:alert-circle"
          class="w-10 h-10 mx-auto mb-3 text-red-500"
        />
        <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Couldn't load suppressions
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Something went wrong fetching the suppression list.
        </p>
        <UBtn size="sm" @click="fetchSuppressions">Retry</UBtn>
      </div>

      <div
        v-else-if="!data?.suppressions.length"
        class="text-center py-16 text-gray-500 dark:text-gray-400"
      >
        <Icon name="lucide:shield-off" class="w-12 h-12 mx-auto mb-3" />
        <p class="text-lg font-medium">
          {{ search ? "No matching addresses" : "No suppressed addresses" }}
        </p>
        <p class="text-sm">
          {{
            search
              ? "Try a different search."
              : "Hard-bounced addresses will show up here automatically, or add one yourself."
          }}
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
                <th class="px-4 py-3">Added</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="s in data.suppressions"
                :key="s.id"
                class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td
                  class="px-4 py-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap"
                >
                  {{ s.email }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                  <span
                    class="text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="reasonBadgeClass(s.reason)"
                  >
                    {{ reasonLabel(s.reason) }}
                  </span>
                </td>
                <td
                  class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
                >
                  <code v-if="s.source" class="text-xs">{{ s.source }}</code>
                  <span v-else>—</span>
                </td>
                <td
                  class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
                >
                  {{ formatDate(s.createdAt) }}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <UBtn variant="danger" size="xs" @click="confirmDelete(s)">
                    Remove
                  </UBtn>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="data.total > data.limit"
          class="flex items-center justify-between pt-4"
        >
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Page {{ data.page }} of {{ totalPages }} ({{ data.total }} total)
          </p>
          <div class="flex gap-2">
            <UBtn
              variant="secondary"
              size="xs"
              :disabled="page <= 1"
              @click="
                page--;
                fetchSuppressions();
              "
            >
              Previous
            </UBtn>
            <UBtn
              variant="secondary"
              size="xs"
              :disabled="page >= totalPages"
              @click="
                page++;
                fetchSuppressions();
              "
            >
              Next
            </UBtn>
          </div>
        </div>
      </div>
    </div>

    <!-- Add address -->
    <Modal
      v-if="showAddModal"
      title="Add suppressed address"
      @close="showAddModal = false"
    >
      <form @submit.prevent="handleAdd">
        <label
          for="add-suppression-email"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Email <span class="text-red-500 dark:text-red-400">*</span>
        </label>
        <input
          id="add-suppression-email"
          v-model="addForm.email"
          type="email"
          required
          placeholder="bounced@example.com"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
        />
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Sends to this address will be blocked until you remove it.
        </p>
        <p
          v-if="addError"
          role="alert"
          class="text-sm text-red-600 dark:text-red-400 mb-2"
        >
          {{ addError }}
        </p>
        <div class="flex justify-end gap-2 mt-4">
          <UBtn type="button" variant="ghost" @click="showAddModal = false">
            Cancel
          </UBtn>
          <UBtn type="submit" :disabled="adding">
            {{ adding ? "Adding..." : "Add" }}
          </UBtn>
        </div>
      </form>
    </Modal>

    <!-- Remove confirmation -->
    <Modal
      v-if="deleteTarget"
      title="Remove suppression"
      title-class="mb-2"
      @close="deleteTarget = null"
    >
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Are you sure you want to remove
        <strong>{{ deleteTarget.email }}</strong> from the suppression list?
        Future emails to this address will be delivered again.
      </p>
      <p
        v-if="deleteError"
        role="alert"
        class="text-sm text-red-600 dark:text-red-400 mb-2"
      >
        {{ deleteError }}
      </p>
      <div class="flex justify-end gap-2">
        <UBtn variant="ghost" @click="deleteTarget = null">Cancel</UBtn>
        <UBtn
          variant="danger-filled"
          :disabled="deleting"
          @click="handleDelete"
        >
          {{ deleting ? "Removing..." : "Remove" }}
        </UBtn>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import type { PaginatedSuppressions, Suppression } from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "Suppressions" });

const api = useApi();
const toast = useToast();

const data = ref<PaginatedSuppressions | null>(null);
const loading = ref(true);
const loadError = ref(false);
const page = ref(1);
const search = ref("");
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const totalPages = computed(() =>
  data.value ? Math.max(1, Math.ceil(data.value.total / data.value.limit)) : 1,
);

async function fetchSuppressions() {
  loading.value = true;
  loadError.value = false;
  try {
    data.value = await api.getSuppressions({
      page: page.value,
      limit: 20,
      q: search.value || undefined,
    });
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

function debouncedFetch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    page.value = 1;
    fetchSuppressions();
  }, 300);
}

onMounted(fetchSuppressions);
onUnmounted(() => {
  if (searchTimeout) clearTimeout(searchTimeout);
});

// ─── Reason display ─────────────────────────────────────────
// Only two reasons exist today: a manual add, or an automatic hard-bounce
// suppression (apps/workers/src/outbound.ts). Anything else falls back to
// its raw value rather than inventing a label for a reason that doesn't
// exist yet.
function reasonLabel(reason: string): string {
  if (reason === "manual") return "Manual";
  if (reason === "hard_bounce") return "Hard bounce";
  return reason;
}

function reasonBadgeClass(reason: string): string {
  if (reason === "hard_bounce")
    return "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400";
  return "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400";
}

// ─── Add ────────────────────────────────────────────────────
const showAddModal = ref(false);
const addForm = reactive({ email: "" });
const addError = ref("");
const adding = ref(false);

function openAddModal() {
  addForm.email = "";
  addError.value = "";
  showAddModal.value = true;
}

async function handleAdd() {
  adding.value = true;
  addError.value = "";
  try {
    await api.addSuppression(addForm.email.trim().toLowerCase());
    showAddModal.value = false;
    toast.success(`${addForm.email} suppressed`);
    page.value = 1;
    search.value = "";
    await fetchSuppressions();
  } catch (e: any) {
    addError.value = e?.data?.error || "Failed to add suppression";
  } finally {
    adding.value = false;
  }
}

// ─── Delete ─────────────────────────────────────────────────
const deleteTarget = ref<Suppression | null>(null);
const deleting = ref(false);
const deleteError = ref("");

function confirmDelete(s: Suppression) {
  deleteTarget.value = s;
  deleteError.value = "";
}

async function handleDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  deleteError.value = "";
  try {
    await api.removeSuppression(deleteTarget.value.id);
    toast.success(`${deleteTarget.value.email} removed`);
    deleteTarget.value = null;
    await fetchSuppressions();
  } catch (e: any) {
    deleteError.value = e?.data?.error || "Failed to remove suppression";
  } finally {
    deleting.value = false;
  }
}

// ─── Formatting ─────────────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
</script>
