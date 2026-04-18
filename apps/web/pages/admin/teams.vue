<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Team Management
        </h2>
        <p class="text-sm text-gray-400 dark:text-gray-500">
          View and manage all teams
        </p>
      </div>
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

      <div v-if="loading" class="text-gray-400 dark:text-gray-500">
        Loading...
      </div>

      <div
        v-else-if="!teamsData?.data.length"
        class="text-center text-gray-400 dark:text-gray-500 py-12"
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
                  class="px-4 py-3 text-gray-400 dark:text-gray-500 whitespace-nowrap"
                >
                  {{ formatDate(team.createdAt) }}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <UBtn
                    variant="secondary"
                    size="xs"
                    @click="navigateTo(`/teams/${team.id}`)"
                  >
                    View
                  </UBtn>
                  <UBtn
                    variant="danger"
                    size="xs"
                    class="ml-1"
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
          <p class="text-xs text-gray-400 dark:text-gray-500">
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

    <!-- Delete Confirmation -->
    <Teleport to="body">
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
            Delete Team
          </h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Are you sure you want to delete
            <strong>{{ deleteTarget.name }}</strong>? All team memberships will
            be removed. This action cannot be undone.
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
import type { AdminTeam, PaginatedTeams } from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "Team Management" });

const api = useApi();
const toast = useToast();

const loading = ref(true);
const teamsData = ref<PaginatedTeams | null>(null);
const page = ref(1);
const search = ref("");
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

async function fetchTeams() {
  loading.value = true;
  try {
    teamsData.value = await api.getAdminTeams({
      page: page.value,
      limit: 20,
      search: search.value || undefined,
    });
  } catch {
    // empty
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

onMounted(fetchTeams);

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
