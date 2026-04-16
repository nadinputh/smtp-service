<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Teams
        </h2>
        <p class="text-sm text-gray-400 dark:text-gray-500">
          Manage teams and team members
        </p>
      </div>
      <UBtn size="sm" @click="showCreateModal = true">
        <Icon name="lucide:plus" class="w-4 h-4" /> Create Team
      </UBtn>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="loading" class="text-gray-400 dark:text-gray-500">
        Loading...
      </div>

      <div
        v-else-if="!teams.length"
        class="text-center text-gray-400 dark:text-gray-500 py-12"
      >
        <Icon
          name="lucide:users-round"
          class="w-12 h-12 mx-auto mb-3 opacity-50"
        />
        <p>No teams yet</p>
        <p class="text-xs mt-1">Create a team to collaborate with others</p>
      </div>

      <!-- Team list / detail split -->
      <div v-else>
        <div v-if="!selectedTeam">
          <div
            class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <table class="w-full text-sm text-left">
              <thead
                class="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400"
              >
                <tr>
                  <th class="px-4 py-3">Name</th>
                  <th class="px-4 py-3">Created</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr
                  v-for="team in teams"
                  :key="team.id"
                  class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                  @click="selectTeam(team)"
                >
                  <td
                    class="px-4 py-3 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap"
                  >
                    {{ team.name }}
                  </td>
                  <td
                    class="px-4 py-3 text-gray-400 dark:text-gray-500 whitespace-nowrap"
                  >
                    {{ formatDate(team.createdAt) }}
                  </td>
                  <td class="px-4 py-3 text-right whitespace-nowrap">
                    <Icon
                      name="lucide:chevron-right"
                      class="w-4 h-4 text-gray-400 dark:text-gray-500 inline-block"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Team Detail -->
        <div v-else>
          <button
            @click="
              selectedTeam = null;
              members = [];
            "
            class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4 transition-colors"
          >
            <Icon name="lucide:arrow-left" class="w-4 h-4" />
            Back to teams
          </button>

          <div
            class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 mb-4"
          >
            <div class="flex items-center justify-between">
              <div>
                <h3
                  class="text-base font-semibold text-gray-800 dark:text-gray-100"
                >
                  {{ selectedTeam.name }}
                </h3>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Created {{ formatDate(selectedTeam.createdAt) }}
                </p>
              </div>
              <div class="flex gap-2">
                <UBtn variant="secondary" size="xs" @click="openRenameModal">
                  Rename
                </UBtn>
                <UBtn variant="danger" size="xs" @click="confirmDeleteTeam">
                  Delete
                </UBtn>
              </div>
            </div>
          </div>

          <!-- Members -->
          <div
            class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
          >
            <div class="flex items-center justify-between mb-4">
              <h4
                class="text-sm font-semibold text-gray-800 dark:text-gray-100"
              >
                Members ({{ members.length }})
              </h4>
              <UBtn size="xs" @click="showAddMemberModal = true">
                <Icon name="lucide:plus" class="w-3.5 h-3.5" /> Add Member
              </UBtn>
            </div>

            <div
              v-if="membersLoading"
              class="text-gray-400 dark:text-gray-500 text-sm"
            >
              Loading...
            </div>

            <div
              v-else-if="!members.length"
              class="text-sm text-gray-400 dark:text-gray-500 text-center py-6"
            >
              No members yet
            </div>

            <div
              v-else
              class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <table class="w-full text-sm text-left">
                <thead
                  class="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400"
                >
                  <tr>
                    <th class="px-4 py-3">Email</th>
                    <th class="px-4 py-3">Name</th>
                    <th class="px-4 py-3">Role</th>
                    <th class="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                  <tr
                    v-for="member in members"
                    :key="member.id"
                    class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td
                      class="px-4 py-3 text-gray-800 dark:text-gray-200 whitespace-nowrap"
                    >
                      {{ member.email }}
                    </td>
                    <td
                      class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
                    >
                      {{ member.name || "—" }}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      <select
                        :value="member.role"
                        @change="
                          handleRoleChange(
                            member,
                            ($event.target as HTMLSelectElement).value,
                          )
                        "
                        class="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                      <UBtn
                        variant="danger"
                        size="xs"
                        @click="handleRemoveMember(member)"
                      >
                        Remove
                      </UBtn>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Team Modal -->
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
            Create Team
          </h2>
          <form @submit.prevent="handleCreateTeam">
            <input
              v-model="newTeamName"
              type="text"
              required
              placeholder="Team name"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p
              v-if="createError"
              class="text-sm text-red-600 dark:text-red-400 mt-2"
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
        </div>
      </div>

      <!-- Rename Modal -->
      <div
        v-if="showRenameModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="showRenameModal = false"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Rename Team
          </h2>
          <form @submit.prevent="handleRename">
            <input
              v-model="renameName"
              type="text"
              required
              placeholder="New team name"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p
              v-if="renameError"
              class="text-sm text-red-600 dark:text-red-400 mt-2"
            >
              {{ renameError }}
            </p>
            <div class="flex justify-end gap-2 mt-4">
              <UBtn
                type="button"
                variant="ghost"
                @click="showRenameModal = false"
              >
                Cancel
              </UBtn>
              <UBtn type="submit" :disabled="renaming">
                {{ renaming ? "Saving..." : "Save" }}
              </UBtn>
            </div>
          </form>
        </div>
      </div>

      <!-- Add Member Modal -->
      <div
        v-if="showAddMemberModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="closeAddMemberModal"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Add Team Member
          </h2>
          <form @submit.prevent="handleAddMember">
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Search User
            </label>
            <div class="relative">
              <div class="relative">
                <Icon
                  name="lucide:search"
                  class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                />
                <input
                  v-model="userSearchQuery"
                  type="text"
                  placeholder="Search by name or email..."
                  class="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  @input="debouncedSearch"
                  @focus="showSearchResults = true"
                />
              </div>

              <!-- Selected user chip -->
              <div
                v-if="selectedUser"
                class="mt-2 flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg"
              >
                <div
                  class="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-xs font-semibold shrink-0"
                >
                  {{
                    (selectedUser.name || selectedUser.email)
                      .charAt(0)
                      .toUpperCase()
                  }}
                </div>
                <div class="min-w-0 flex-1">
                  <p
                    class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate"
                  >
                    {{ selectedUser.name || selectedUser.email }}
                  </p>
                  <p
                    v-if="selectedUser.name"
                    class="text-xs text-gray-400 dark:text-gray-500 truncate"
                  >
                    {{ selectedUser.email }}
                  </p>
                </div>
                <button
                  type="button"
                  class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  @click="clearSelectedUser"
                >
                  <Icon name="lucide:x" class="w-4 h-4" />
                </button>
              </div>

              <!-- Search results dropdown -->
              <div
                v-if="
                  showSearchResults &&
                  !selectedUser &&
                  userSearchQuery.length >= 2
                "
                class="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto"
              >
                <div
                  v-if="searching"
                  class="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center"
                >
                  Searching...
                </div>
                <div
                  v-else-if="!searchResults.length"
                  class="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center"
                >
                  No users found
                </div>
                <button
                  v-for="user in searchResults"
                  :key="user.id"
                  type="button"
                  class="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                  @click="selectUser(user)"
                >
                  <div
                    class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-sm font-semibold shrink-0"
                  >
                    {{ (user.name || user.email).charAt(0).toUpperCase() }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p
                      class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate"
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

            <label
              class="block text-sm text-gray-600 dark:text-gray-400 mb-1 mt-3"
            >
              Role
            </label>
            <select
              v-model="addMemberForm.role"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <p
              v-if="addMemberError"
              class="text-sm text-red-600 dark:text-red-400 mb-2"
            >
              {{ addMemberError }}
            </p>
            <div class="flex justify-end gap-2 mt-4">
              <UBtn type="button" variant="ghost" @click="closeAddMemberModal">
                Cancel
              </UBtn>
              <UBtn type="submit" :disabled="addingMember || !selectedUser">
                {{ addingMember ? "Adding..." : "Add" }}
              </UBtn>
            </div>
          </form>
        </div>
      </div>

      <!-- Delete Team Confirmation -->
      <div
        v-if="showDeleteTeamModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="showDeleteTeamModal = false"
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
            <strong>{{ selectedTeam?.name }}</strong
            >? All team memberships will be removed.
          </p>
          <p
            v-if="deleteTeamError"
            class="text-sm text-red-600 dark:text-red-400 mb-2"
          >
            {{ deleteTeamError }}
          </p>
          <div class="flex justify-end gap-2">
            <UBtn variant="ghost" @click="showDeleteTeamModal = false">
              Cancel
            </UBtn>
            <UBtn
              variant="danger-filled"
              :disabled="deletingTeam"
              @click="handleDeleteTeam"
            >
              {{ deletingTeam ? "Deleting..." : "Delete" }}
            </UBtn>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { Team, TeamMember } from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "Teams" });

const api = useApi();

const loading = ref(true);
const teams = ref<Team[]>([]);
const selectedTeam = ref<Team | null>(null);
const members = ref<TeamMember[]>([]);
const membersLoading = ref(false);

async function fetchTeams() {
  loading.value = true;
  try {
    teams.value = await api.getTeams();
  } catch {
    // empty
  } finally {
    loading.value = false;
  }
}

async function selectTeam(team: Team) {
  selectedTeam.value = team;
  membersLoading.value = true;
  try {
    members.value = await api.getTeamMembers(team.id);
  } catch {
    members.value = [];
  } finally {
    membersLoading.value = false;
  }
}

onMounted(fetchTeams);

// ─── Create Team ───────────────────────────────────────────
const showCreateModal = ref(false);
const newTeamName = ref("");
const creating = ref(false);
const createError = ref("");

async function handleCreateTeam() {
  creating.value = true;
  createError.value = "";
  try {
    const team = await api.createTeam(newTeamName.value);
    showCreateModal.value = false;
    newTeamName.value = "";
    await fetchTeams();
    selectTeam(team);
  } catch (e: any) {
    createError.value = e?.data?.error || "Failed to create team";
  } finally {
    creating.value = false;
  }
}

// ─── Rename Team ───────────────────────────────────────────
const showRenameModal = ref(false);
const renameName = ref("");
const renaming = ref(false);
const renameError = ref("");

function openRenameModal() {
  renameName.value = selectedTeam.value?.name ?? "";
  renameError.value = "";
  showRenameModal.value = true;
}

async function handleRename() {
  if (!selectedTeam.value) return;
  renaming.value = true;
  renameError.value = "";
  try {
    const updated = await api.updateTeam(
      selectedTeam.value.id,
      renameName.value,
    );
    selectedTeam.value = updated;
    showRenameModal.value = false;
    await fetchTeams();
  } catch (e: any) {
    renameError.value = e?.data?.error || "Failed to rename team";
  } finally {
    renaming.value = false;
  }
}

// ─── Delete Team ───────────────────────────────────────────
const showDeleteTeamModal = ref(false);
const deletingTeam = ref(false);
const deleteTeamError = ref("");

function confirmDeleteTeam() {
  deleteTeamError.value = "";
  showDeleteTeamModal.value = true;
}

async function handleDeleteTeam() {
  if (!selectedTeam.value) return;
  deletingTeam.value = true;
  deleteTeamError.value = "";
  try {
    await api.deleteTeam(selectedTeam.value.id);
    showDeleteTeamModal.value = false;
    selectedTeam.value = null;
    members.value = [];
    await fetchTeams();
  } catch (e: any) {
    deleteTeamError.value = e?.data?.error || "Failed to delete team";
  } finally {
    deletingTeam.value = false;
  }
}

// ─── Members ───────────────────────────────────────────────
const showAddMemberModal = ref(false);
const addMemberForm = reactive({ role: "member" });
const addingMember = ref(false);
const addMemberError = ref("");

// User search state
const userSearchQuery = ref("");
const searchResults = ref<{ id: string; email: string; name: string | null }[]>(
  [],
);
const selectedUser = ref<{
  id: string;
  email: string;
  name: string | null;
} | null>(null);
const searching = ref(false);
const showSearchResults = ref(false);
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout);
  selectedUser.value = null;
  if (userSearchQuery.value.length < 2) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  searchTimeout = setTimeout(async () => {
    try {
      searchResults.value = await api.searchUsers(userSearchQuery.value);
    } catch {
      searchResults.value = [];
    } finally {
      searching.value = false;
    }
  }, 300);
}

function selectUser(user: { id: string; email: string; name: string | null }) {
  selectedUser.value = user;
  showSearchResults.value = false;
  userSearchQuery.value = "";
  searchResults.value = [];
}

function clearSelectedUser() {
  selectedUser.value = null;
  userSearchQuery.value = "";
  searchResults.value = [];
}

function closeAddMemberModal() {
  showAddMemberModal.value = false;
  clearSelectedUser();
  addMemberForm.role = "member";
  addMemberError.value = "";
}

async function handleAddMember() {
  if (!selectedTeam.value || !selectedUser.value) return;
  addingMember.value = true;
  addMemberError.value = "";
  try {
    await api.addTeamMember(
      selectedTeam.value.id,
      selectedUser.value.id,
      addMemberForm.role,
    );
    closeAddMemberModal();
    members.value = await api.getTeamMembers(selectedTeam.value.id);
  } catch (e: any) {
    addMemberError.value = e?.data?.error || "Failed to add member";
  } finally {
    addingMember.value = false;
  }
}

async function handleRoleChange(member: TeamMember, newRole: string) {
  if (!selectedTeam.value || newRole === member.role) return;
  try {
    await api.updateTeamMemberRole(
      selectedTeam.value.id,
      member.userId,
      newRole,
    );
    members.value = await api.getTeamMembers(selectedTeam.value.id);
  } catch {
    // revert will happen on next fetch
  }
}

async function handleRemoveMember(member: TeamMember) {
  if (!selectedTeam.value) return;
  try {
    await api.removeTeamMember(selectedTeam.value.id, member.userId);
    members.value = await api.getTeamMembers(selectedTeam.value.id);
  } catch {
    // silently fail
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
