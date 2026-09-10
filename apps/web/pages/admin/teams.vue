<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 py-3 min-h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h1 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Team Management
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          View and manage all teams
        </p>
      </div>
      <UBtn size="sm" class="self-start sm:self-auto" @click="openCreateModal">
        <Icon name="lucide:plus" class="w-4 h-4" /> Create Team
      </UBtn>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <!-- Search -->
      <div class="mb-4">
        <input
          v-model="search"
          type="text"
          placeholder="Search by team name..."
          class="w-full max-w-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          @input="debouncedFetch"
        />
      </div>

      <div v-if="loading" class="text-gray-500 dark:text-gray-400">
        Loading...
      </div>

      <div v-else-if="loadError" class="text-center py-12">
        <Icon
          name="lucide:alert-circle"
          class="w-10 h-10 mx-auto mb-3 text-red-500"
        />
        <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Couldn't load teams
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Something went wrong fetching the team list.
        </p>
        <UBtn size="sm" @click="fetchTeams">Retry</UBtn>
      </div>

      <div
        v-else-if="!teamsData?.data.length"
        class="text-center text-gray-500 dark:text-gray-400 py-12"
      >
        <Icon
          name="lucide:users-round"
          class="w-12 h-12 mx-auto mb-3 opacity-50"
        />
        <p>No teams found</p>
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
                <th class="px-4 py-3">Owner</th>
                <th class="px-4 py-3">Members</th>
                <th class="px-4 py-3">Created</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="team in teamsData.data"
                :key="team.id"
                class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td
                  class="px-4 py-3 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap"
                >
                  {{ team.name }}
                </td>
                <td
                  class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
                >
                  {{ team.ownerName || team.ownerEmail }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                  <span
                    class="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                  >
                    {{ team.memberCount }}
                  </span>
                </td>
                <td
                  class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
                >
                  {{ formatDate(team.createdAt) }}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <UBtn
                    variant="secondary"
                    size="xs"
                    class="min-h-11"
                    @click="openEditModal(team)"
                  >
                    Edit
                  </UBtn>
                  <UBtn
                    variant="secondary"
                    size="xs"
                    class="ml-2 min-h-11"
                    @click="navigateTo(`/teams/${team.id}`)"
                  >
                    Manage members
                  </UBtn>
                  <UBtn
                    variant="danger"
                    size="xs"
                    class="ml-2 min-h-11"
                    @click="confirmDelete(team)"
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
          v-if="teamsData.pagination.pages > 1"
          class="flex items-center justify-between pt-4"
        >
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Page {{ teamsData.pagination.page }} of
            {{ teamsData.pagination.pages }} ({{ teamsData.pagination.total }}
            teams)
          </p>
          <div class="flex gap-2">
            <UBtn
              variant="secondary"
              size="xs"
              :disabled="page <= 1"
              @click="
                page--;
                fetchTeams();
              "
            >
              Previous
            </UBtn>
            <UBtn
              variant="secondary"
              size="xs"
              :disabled="page >= teamsData.pagination.pages"
              @click="
                page++;
                fetchTeams();
              "
            >
              Next
            </UBtn>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <Modal v-if="editTarget" title="Edit Team" @close="editTarget = null">
      <form @submit.prevent="handleEdit">
        <label
          for="edit-team-name"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Name
        </label>
        <input
          id="edit-team-name"
          v-model="editForm.name"
          type="text"
          required
          placeholder="Team name"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
        />
        <p
          v-if="editError"
          role="alert"
          class="text-sm text-red-600 dark:text-red-400 mb-2"
        >
          {{ editError }}
        </p>
        <div class="flex justify-end gap-2 mt-4">
          <UBtn type="button" variant="ghost" @click="editTarget = null">
            Cancel
          </UBtn>
          <UBtn type="submit" :disabled="saving">
            {{ saving ? "Saving..." : "Save" }}
          </UBtn>
        </div>
      </form>
    </Modal>

    <!-- Create Modal -->
    <Modal v-if="showCreateModal" title="Create Team" @close="showCreateModal = false">
      <form @submit.prevent="handleCreate">
        <label
          for="create-team-name"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Name <span class="text-red-500 dark:text-red-400">*</span>
        </label>
        <input
          id="create-team-name"
          v-model="createForm.name"
          type="text"
          required
          placeholder="Team name"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
        />
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
          You'll be the team's owner. You can add members afterward from
          "Manage members".
        </p>
        <p
          v-if="createError"
          role="alert"
          class="text-sm text-red-600 dark:text-red-400 mb-2"
        >
          {{ createError }}
        </p>
        <div class="flex justify-end gap-2 mt-4">
          <UBtn
            type="button"
            variant="ghost"
            @click="showCreateModal = false"
          >
            Cancel
          </UBtn>
          <UBtn type="submit" :disabled="creating">
            {{ creating ? "Creating..." : "Create" }}
          </UBtn>
        </div>
      </form>
    </Modal>

    <!-- Delete Confirmation -->
    <Modal
      v-if="deleteTarget"
      title="Delete Team"
      title-class="mb-2"
      @close="deleteTarget = null"
    >
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Are you sure you want to delete
        <strong>{{ deleteTarget.name }}</strong>? All team memberships will
        be removed. This action cannot be undone.
      </p>
      <p
        v-if="deleteError"
        role="alert"
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
    </Modal>
  </div>
</template>

<script setup lang="ts">
import type { AdminTeam, PaginatedTeams } from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "Team Management" });

const api = useApi();
const toast = useToast();

const loading = ref(true);
const loadError = ref(false);
const teamsData = ref<PaginatedTeams | null>(null);
const page = ref(1);
const search = ref("");
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

async function fetchTeams() {
  loading.value = true;
  loadError.value = false;
  try {
    teamsData.value = await api.getAdminTeams({
      page: page.value,
      limit: 20,
      search: search.value || undefined,
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
    fetchTeams();
  }, 300);
}

onMounted(() => {
  fetchTeams();
});

onUnmounted(() => {
  if (searchTimeout) clearTimeout(searchTimeout);
});

// ─── Edit ──────────────────────────────────────────────────
const editTarget = ref<AdminTeam | null>(null);
const editForm = reactive({ name: "" });
const editError = ref("");
const saving = ref(false);

function openEditModal(team: AdminTeam) {
  editTarget.value = team;
  editForm.name = team.name;
  editError.value = "";
}

async function handleEdit() {
  if (!editTarget.value) return;
  saving.value = true;
  editError.value = "";
  try {
    await api.updateTeam(editTarget.value.id, editForm.name);
    toast.success(`Team "${editForm.name}" updated`);
    editTarget.value = null;
    await fetchTeams();
  } catch (e: any) {
    editError.value = e?.data?.error || "Failed to update team";
  } finally {
    saving.value = false;
  }
}

// ─── Create ────────────────────────────────────────────────
const showCreateModal = ref(false);
const createForm = reactive({ name: "" });
const createError = ref("");
const creating = ref(false);

function openCreateModal() {
  createForm.name = "";
  createError.value = "";
  showCreateModal.value = true;
}

async function handleCreate() {
  creating.value = true;
  createError.value = "";
  try {
    await api.createTeam(createForm.name);
    toast.success(`Team "${createForm.name}" created`);
    showCreateModal.value = false;
    await fetchTeams();
  } catch (e: any) {
    createError.value = e?.data?.error || "Failed to create team";
  } finally {
    creating.value = false;
  }
}

// ─── Delete ────────────────────────────────────────────────
const deleteTarget = ref<AdminTeam | null>(null);
const deleting = ref(false);
const deleteError = ref("");

function confirmDelete(team: AdminTeam) {
  deleteTarget.value = team;
  deleteError.value = "";
}

async function handleDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  deleteError.value = "";
  try {
    await api.deleteTeam(deleteTarget.value.id);
    toast.success(`Team "${deleteTarget.value.name}" deleted`);
    deleteTarget.value = null;
    await fetchTeams();
  } catch (e: any) {
    deleteError.value = e?.data?.error || "Failed to delete team";
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
