<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Inbox Management
        </h2>
        <p class="text-sm text-gray-400 dark:text-gray-500">
          View and manage all inboxes across users
        </p>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <!-- Search -->
      <div class="mb-4">
        <input
          v-model="search"
          type="text"
          placeholder="Search by name, email, or SMTP username..."
          class="w-full max-w-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          @input="debouncedFetch"
        />
      </div>

      <div v-if="loading" class="text-gray-400 dark:text-gray-500">
        Loading...
      </div>

      <div
        v-else-if="!inboxesData?.data.length"
        class="text-center text-gray-400 dark:text-gray-500 py-12"
      >
        <Icon name="lucide:inbox" class="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No inboxes found</p>
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
                <th class="px-4 py-3">Inbox</th>
                <th class="px-4 py-3">Owner</th>
                <th class="px-4 py-3">Team</th>
                <th class="px-4 py-3">SMTP User</th>
                <th class="px-4 py-3">Messages</th>
                <th class="px-4 py-3">Created</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="inbox in inboxesData.data"
                :key="inbox.id"
                class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td
                  class="px-4 py-3 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap"
                >
                  {{ inbox.name }}
                </td>
                <td
                  class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
                >
                  {{ inbox.ownerName || inbox.ownerEmail }}
                  <span
                    v-if="inbox.ownerName"
                    class="block text-xs text-gray-400 dark:text-gray-500"
                  >
                    {{ inbox.ownerEmail }}
                  </span>
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                  <span
                    v-if="inbox.teamName"
                    class="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  >
                    {{ inbox.teamName }}
                  </span>
                  <span v-else class="text-xs text-gray-400 dark:text-gray-500">
                    —
                  </span>
                </td>
                <td
                  class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs"
                >
                  {{ inbox.smtpUsername }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                  <span
                    class="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                  >
                    {{ inbox.messageCount }}
                  </span>
                </td>
                <td
                  class="px-4 py-3 text-gray-400 dark:text-gray-500 whitespace-nowrap"
                >
                  {{ formatDate(inbox.createdAt) }}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <UBtn
                    variant="secondary"
                    size="xs"
                    @click="openEditModal(inbox)"
                  >
                    Edit
                  </UBtn>
                  <UBtn
                    variant="danger"
                    size="xs"
                    class="ml-1"
                    @click="confirmDelete(inbox)"
                  >
                    Delete
                  </UBtn>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div
          v-if="inboxesData.pagination.pages > 1"
          class="flex items-center justify-between pt-4"
        >
          <p class="text-xs text-gray-400 dark:text-gray-500">
            Page {{ inboxesData.pagination.page }} of
            {{ inboxesData.pagination.pages }} ({{
              inboxesData.pagination.total
            }}
            inboxes)
          </p>
          <div class="flex gap-2">
            <UBtn
              variant="secondary"
              size="xs"
              :disabled="page <= 1"
              @click="
                page--;
                fetchInboxes();
              "
            >
              Previous
            </UBtn>
            <UBtn
              variant="secondary"
              size="xs"
              :disabled="page >= inboxesData.pagination.pages"
              @click="
                page++;
                fetchInboxes();
              "
            >
              Next
            </UBtn>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <Teleport to="body">
      <div
        v-if="editInbox"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="editInbox = null"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Edit Inbox
          </h2>
          <form @submit.prevent="handleEdit">
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Name
            </label>
            <input
              v-model="editForm.name"
              type="text"
              placeholder="Inbox name"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
            />
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Owner
            </label>
            <div class="relative mb-3">
              <!-- Selected owner chip -->
              <div
                v-if="selectedOwner"
                class="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg"
              >
                <div
                  class="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-semibold shrink-0"
                >
                  {{
                    (selectedOwner.name || selectedOwner.email)
                      .charAt(0)
                      .toUpperCase()
                  }}
                </div>
                <div class="min-w-0 flex-1">
                  <p
                    class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate"
                  >
                    {{ selectedOwner.name || selectedOwner.email }}
                  </p>
                  <p
                    v-if="selectedOwner.name"
                    class="text-xs text-gray-400 dark:text-gray-500 truncate"
                  >
                    {{ selectedOwner.email }}
                  </p>
                </div>
                <button
                  type="button"
                  class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  @click="clearSelectedOwner"
                >
                  <Icon name="lucide:x" class="w-4 h-4" />
                </button>
              </div>

              <!-- Search input -->
              <div v-else class="relative">
                <Icon
                  name="lucide:search"
                  class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                />
                <input
                  v-model="ownerSearchQuery"
                  type="text"
                  placeholder="Search by name or email..."
                  class="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  @input="debouncedOwnerSearch"
                  @focus="showOwnerResults = true"
                />
              </div>

              <!-- Search results dropdown -->
              <div
                v-if="
                  showOwnerResults &&
                  !selectedOwner &&
                  ownerSearchQuery.length >= 2
                "
                class="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto"
              >
                <div
                  v-if="ownerSearching"
                  class="px-3 py-3 text-sm text-gray-400 text-center"
                >
                  Searching...
                </div>
                <div
                  v-else-if="!ownerSearchResults.length"
                  class="px-3 py-3 text-sm text-gray-400 text-center"
                >
                  No users found
                </div>
                <button
                  v-for="user in ownerSearchResults"
                  :key="user.id"
                  type="button"
                  class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                  @click="selectOwner(user)"
                >
                  <div
                    class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-semibold shrink-0"
                  >
                    {{ (user.name || user.email).charAt(0).toUpperCase() }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p
                      class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate"
                    >
                      {{ user.name || user.email }}
                    </p>
                    <p
                      v-if="user.name"
                      class="text-xs text-gray-400 dark:text-gray-500 truncate"
                    >
                      {{ user.email }}
                    </p>
                  </div>
                </button>
              </div>
            </div>
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Team (optional)
            </label>
            <select
              v-model="editForm.teamId"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
            >
              <option value="">No team</option>
              <option v-for="team in allTeams" :key="team.id" :value="team.id">
                {{ team.name }}
              </option>
            </select>
            <p
              v-if="editError"
              class="text-sm text-red-600 dark:text-red-400 mb-2"
            >
              {{ editError }}
            </p>
            <div class="flex justify-end gap-2 mt-4">
              <UBtn type="button" variant="ghost" @click="editInbox = null">
                Cancel
              </UBtn>
              <UBtn type="submit" :disabled="saving">
                {{ saving ? "Saving..." : "Save" }}
              </UBtn>
            </div>
          </form>
        </div>
      </div>

      <!-- Delete Confirmation -->
      <div
        v-if="deleteTarget"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="deleteTarget = null"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2"
          >
            Delete Inbox
          </h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">
            Are you sure you want to delete
            <strong>{{ deleteTarget.name }}</strong
            >?
          </p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-4">
            This will permanently delete all {{ deleteTarget.messageCount }}
            messages in this inbox. This cannot be undone.
          </p>
          <p
            v-if="deleteError"
            class="text-sm text-red-600 dark:text-red-400 mb-2"
          >
            {{ deleteError }}
          </p>
          <div class="flex justify-end gap-2">
            <UBtn variant="ghost" @click="deleteTarget = null"> Cancel </UBtn>
            <UBtn
              variant="danger-filled"
              :disabled="deleting"
              @click="handleDelete"
            >
              {{ deleting ? "Deleting..." : "Delete" }}
            </UBtn>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type {
  AdminInbox,
  PaginatedAdminInboxes,
  AdminTeam,
} from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "Inbox Management" });

const api = useApi();

const loading = ref(true);
const inboxesData = ref<PaginatedAdminInboxes | null>(null);
const search = ref("");
const page = ref(1);
const allTeams = ref<AdminTeam[]>([]);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedFetch() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    page.value = 1;
    fetchInboxes();
  }, 300);
}

async function fetchInboxes() {
  loading.value = true;
  try {
    inboxesData.value = await api.getAdminInboxes({
      page: page.value,
      limit: 25,
      search: search.value || undefined,
    });
  } catch {
    // empty
  } finally {
    loading.value = false;
  }
}

async function fetchTeams() {
  try {
    const result = await api.getAdminTeams({ limit: 100 });
    allTeams.value = result.data;
  } catch {
    // empty
  }
}

onMounted(() => {
  fetchInboxes();
  fetchTeams();
});

// ─── Owner autocomplete ────────────────────────────────────
const ownerSearchQuery = ref("");
const ownerSearchResults = ref<
  { id: string; email: string; name: string | null }[]
>([]);
const selectedOwner = ref<{
  id: string;
  email: string;
  name: string | null;
} | null>(null);
const ownerSearching = ref(false);
const showOwnerResults = ref(false);
let ownerSearchTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedOwnerSearch() {
  if (ownerSearchTimeout) clearTimeout(ownerSearchTimeout);
  selectedOwner.value = null;
  if (ownerSearchQuery.value.length < 2) {
    ownerSearchResults.value = [];
    return;
  }
  ownerSearching.value = true;
  ownerSearchTimeout = setTimeout(async () => {
    try {
      ownerSearchResults.value = await api.searchUsers(ownerSearchQuery.value);
    } catch {
      ownerSearchResults.value = [];
    } finally {
      ownerSearching.value = false;
    }
  }, 300);
}

function selectOwner(user: { id: string; email: string; name: string | null }) {
  selectedOwner.value = user;
  editForm.userId = user.id;
  showOwnerResults.value = false;
  ownerSearchQuery.value = "";
  ownerSearchResults.value = [];
}

function clearSelectedOwner() {
  selectedOwner.value = null;
  editForm.userId = "";
  ownerSearchQuery.value = "";
  ownerSearchResults.value = [];
}

// ─── Edit ──────────────────────────────────────────────────
const editInbox = ref<AdminInbox | null>(null);
const editForm = reactive({ name: "", userId: "", teamId: "" });
const editError = ref("");
const saving = ref(false);

function openEditModal(inbox: AdminInbox) {
  editInbox.value = inbox;
  editForm.name = inbox.name;
  editForm.userId = inbox.userId;
  editForm.teamId = inbox.teamId ?? "";
  editError.value = "";
  // Pre-populate the selected owner from the inbox data
  selectedOwner.value = {
    id: inbox.userId,
    email: inbox.ownerEmail,
    name: inbox.ownerName,
  };
  ownerSearchQuery.value = "";
  ownerSearchResults.value = [];
}

async function handleEdit() {
  if (!editInbox.value) return;
  saving.value = true;
  editError.value = "";
  try {
    await api.updateAdminInbox(editInbox.value.id, {
      name: editForm.name || undefined,
      userId: editForm.userId || undefined,
      teamId: editForm.teamId || null,
    });
    editInbox.value = null;
    await fetchInboxes();
  } catch (e: any) {
    editError.value = e?.data?.error || "Failed to update inbox";
  } finally {
    saving.value = false;
  }
}

// ─── Delete ────────────────────────────────────────────────
const deleteTarget = ref<AdminInbox | null>(null);
const deleteError = ref("");
const deleting = ref(false);

function confirmDelete(inbox: AdminInbox) {
  deleteTarget.value = inbox;
  deleteError.value = "";
}

async function handleDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  deleteError.value = "";
  try {
    await api.deleteAdminInbox(deleteTarget.value.id);
    deleteTarget.value = null;
    await fetchInboxes();
  } catch (e: any) {
    deleteError.value = e?.data?.error || "Failed to delete inbox";
  } finally {
    deleting.value = false;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
</script>
