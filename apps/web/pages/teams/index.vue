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
      <!-- Pending Invitations Banner -->
      <div v-if="myInvitations.length" class="mb-4 space-y-2">
        <div
          v-for="inv in myInvitations"
          :key="inv.id"
          class="flex items-center justify-between px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg"
        >
          <div>
            <p class="text-sm font-medium text-gray-800 dark:text-gray-100">
              You're invited to join <strong>{{ inv.teamName }}</strong> as
              {{ inv.role }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Invited by {{ inv.inviterName || inv.inviterEmail }}
            </p>
          </div>
          <div class="flex gap-2 shrink-0">
            <UBtn size="xs" @click="handleAcceptInvitation(inv)">Accept</UBtn>
            <UBtn
              size="xs"
              variant="ghost"
              @click="handleDeclineInvitation(inv)"
              >Decline</UBtn
            >
          </div>
        </div>
      </div>

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

      <!-- Team list -->
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
                <th class="px-4 py-3">Created</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="team in teams"
                :key="team.id"
                class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                @click="navigateTo(`/teams/${team.id}`)"
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
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { Team, MyInvitation } from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "Teams" });

const api = useApi();
const toast = useToast();

const loading = ref(true);
const teams = ref<Team[]>([]);
const myInvitations = ref<MyInvitation[]>([]);

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

async function fetchMyInvitations() {
  try {
    myInvitations.value = await api.getMyInvitations();
  } catch {
    myInvitations.value = [];
  }
}

onMounted(() => {
  fetchTeams();
  fetchMyInvitations();
});

// ─── Accept / Decline Invitations ──────────────────────────
async function handleAcceptInvitation(inv: MyInvitation) {
  try {
    await api.acceptInvitation(inv.id);
    toast.success(`Joined ${inv.teamName}`);
    await fetchMyInvitations();
    await fetchTeams();
  } catch {
    toast.error("Failed to accept invitation");
  }
}

async function handleDeclineInvitation(inv: MyInvitation) {
  try {
    await api.declineInvitation(inv.id);
    toast.success("Invitation declined");
    await fetchMyInvitations();
  } catch {
    toast.error("Failed to decline invitation");
  }
}

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
    toast.success(`Team "${team.name}" created`);
    showCreateModal.value = false;
    newTeamName.value = "";
    navigateTo(`/teams/${team.id}`);
  } catch (e: any) {
    createError.value = e?.data?.error || "Failed to create team";
  } finally {
    creating.value = false;
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
