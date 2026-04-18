<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between"
    >
      <div class="flex items-center gap-3">
        <button
          @click="router.back()"
          class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <Icon name="lucide:arrow-left" class="w-4 h-4" />
        </button>
        <div>
          <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
            {{ selectedTeam?.name || "Team" }}
          </h2>
          <p
            v-if="selectedTeam"
            class="text-sm text-gray-400 dark:text-gray-500"
          >
            Created {{ formatDate(selectedTeam.createdAt) }}
          </p>
        </div>
      </div>
      <div v-if="canManage" class="flex gap-2">
        <UBtn variant="secondary" size="sm" @click="openRenameModal">
          Rename
        </UBtn>
        <UBtn variant="danger" size="sm" @click="confirmDeleteTeam">
          Delete
        </UBtn>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="loading" class="text-gray-400 dark:text-gray-500">
        Loading...
      </div>

      <div v-else-if="!selectedTeam" class="text-center text-gray-400 dark:text-gray-500 py-12">
        <p>Team not found</p>
      </div>

      <div v-else>
        <!-- Tabs -->
        <div
          class="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700"
        >
          <button
            v-for="tab in detailTabs"
            :key="tab.key"
            @click="activeTab = tab.key"
            class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
            :class="
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            "
          >
            {{ tab.label }}
            <span
              v-if="tab.count !== undefined"
              class="ml-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full"
            >
              {{ tab.count }}
            </span>
          </button>
        </div>

        <!-- Members Tab -->
        <div
          v-if="activeTab === 'members'"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
        >
          <div class="flex items-center justify-between mb-4">
            <h4
              class="text-sm font-semibold text-gray-800 dark:text-gray-100"
            >
              Members ({{ members.length }})
            </h4>
            <UBtn
              v-if="canManage"
              size="xs"
              @click="showAddMemberModal = true"
            >
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
                      v-if="canManage"
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
                    <span
                      v-else
                      class="text-xs px-2 py-0.5 rounded-full font-medium"
                      :class="
                        member.role === 'admin'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      "
                    >
                      {{ member.role }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right whitespace-nowrap">
                    <UBtn
                      v-if="canManage"
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

        <!-- Inboxes Tab -->
        <div
          v-if="activeTab === 'inboxes'"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
        >
          <div class="flex items-center justify-between mb-4">
            <h4
              class="text-sm font-semibold text-gray-800 dark:text-gray-100"
            >
              Inboxes ({{ teamInboxes.length }})
            </h4>
          </div>

          <div
            v-if="inboxesLoading"
            class="text-gray-400 dark:text-gray-500 text-sm"
          >
            Loading...
          </div>

          <div
            v-else-if="!teamInboxes.length"
            class="text-sm text-gray-400 dark:text-gray-500 text-center py-6"
          >
            <p>No inboxes assigned to this team</p>
            <p class="text-xs mt-1">
              Assign an inbox when creating one, or edit an existing inbox to
              add it to this team.
            </p>
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
                  <th class="px-4 py-3">Name</th>
                  <th class="px-4 py-3">SMTP Username</th>
                  <th class="px-4 py-3">Created</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr
                  v-for="inbox in teamInboxes"
                  :key="inbox.id"
                  class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td
                    class="px-4 py-3 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap"
                  >
                    <NuxtLink
                      :to="`/inbox/${inbox.id}`"
                      class="text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      {{ inbox.name }}
                    </NuxtLink>
                  </td>
                  <td
                    class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs"
                  >
                    {{ inbox.smtpUsername }}
                  </td>
                  <td
                    class="px-4 py-3 text-gray-400 dark:text-gray-500 whitespace-nowrap"
                  >
                    {{ formatDate(inbox.createdAt) }}
                  </td>
                  <td class="px-4 py-3 text-right whitespace-nowrap">
                    <UBtn
                      v-if="canManage"
                      variant="secondary"
                      size="xs"
                      @click="handleUnassignInbox(inbox)"
                    >
                      Unassign
                    </UBtn>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Invitations Tab -->
        <div
          v-if="activeTab === 'invitations'"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
        >
          <div class="flex items-center justify-between mb-4">
            <h4
              class="text-sm font-semibold text-gray-800 dark:text-gray-100"
            >
              Pending Invitations ({{ invitations.length }})
            </h4>
            <UBtn
              v-if="canManage"
              size="xs"
              @click="showInviteModal = true"
            >
              <Icon name="lucide:mail" class="w-3.5 h-3.5" /> Invite by Email
            </UBtn>
          </div>

          <div
            v-if="invitationsLoading"
            class="text-gray-400 dark:text-gray-500 text-sm"
          >
            Loading...
          </div>

          <div
            v-else-if="!invitations.length"
            class="text-sm text-gray-400 dark:text-gray-500 text-center py-6"
          >
            No pending invitations
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
                  <th class="px-4 py-3">Role</th>
                  <th class="px-4 py-3">Invited by</th>
                  <th class="px-4 py-3">Expires</th>
                  <th class="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <tr
                  v-for="inv in invitations"
                  :key="inv.id"
                  class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td
                    class="px-4 py-3 text-gray-800 dark:text-gray-200 whitespace-nowrap"
                  >
                    {{ inv.email }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap">
                    <span
                      class="text-xs px-2 py-0.5 rounded-full font-medium"
                      :class="
                        inv.role === 'admin'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      "
                    >
                      {{ inv.role }}
                    </span>
                  </td>
                  <td
                    class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
                  >
                    {{ inv.inviterName || inv.inviterEmail }}
                  </td>
                  <td
                    class="px-4 py-3 text-gray-400 dark:text-gray-500 whitespace-nowrap"
                  >
                    {{ formatDate(inv.expiresAt) }}
                  </td>
                  <td class="px-4 py-3 text-right whitespace-nowrap">
                    <UBtn
                      v-if="canManage"
                      variant="danger"
                      size="xs"
                      @click="handleRevokeInvitation(inv)"
                    >
                      Revoke
                    </UBtn>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Activity Tab -->
        <div
          v-if="activeTab === 'activity'"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
        >
          <h4
            class="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Activity Log
          </h4>

          <div
            v-if="activityLoading"
            class="text-gray-400 dark:text-gray-500 text-sm"
          >
            Loading...
          </div>

          <div
            v-else-if="!activity.length"
            class="text-sm text-gray-400 dark:text-gray-500 text-center py-6"
          >
            No activity recorded yet
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="entry in activity"
              :key="entry.id"
              class="flex items-start gap-3 text-sm"
            >
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                :class="activityIconClass(entry.action)"
              >
                <Icon :name="activityIcon(entry.action)" class="w-4 h-4" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-gray-800 dark:text-gray-200">
                  <span class="font-medium">{{
                    entry.actorName || entry.actorEmail
                  }}</span>
                  {{ activityDescription(entry) }}
                </p>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {{ formatDateTime(entry.createdAt) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <Teleport to="body">
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
            <label
              class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
            >
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
              <UBtn
                type="button"
                variant="ghost"
                @click="closeAddMemberModal"
              >
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

      <!-- Invite by Email Modal -->
      <div
        v-if="showInviteModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="closeInviteModal"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Invite by Email
          </h2>
          <form @submit.prevent="handleSendInvitation">
            <label
              class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
            >
              Email Address
            </label>
            <input
              v-model="inviteForm.email"
              type="email"
              required
              placeholder="user@example.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <label
              class="block text-sm text-gray-600 dark:text-gray-400 mb-1 mt-3"
            >
              Role
            </label>
            <select
              v-model="inviteForm.role"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <p
              v-if="inviteError"
              class="text-sm text-red-600 dark:text-red-400 mt-2"
            >
              {{ inviteError }}
            </p>
            <div class="flex justify-end gap-2 mt-4">
              <UBtn type="button" variant="ghost" @click="closeInviteModal">
                Cancel
              </UBtn>
              <UBtn type="submit" :disabled="sendingInvite">
                {{ sendingInvite ? "Sending..." : "Send Invite" }}
              </UBtn>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type {
  Team,
  TeamMember,
  TeamInbox,
  TeamActivity,
  TeamInvitationDetail,
} from "~/composables/useApi";

definePageMeta({ layout: "default" });

const route = useRoute();
const router = useRouter();
const api = useApi();
const toast = useToast();

const teamId = route.params.teamId as string;

const loading = ref(true);
const selectedTeam = ref<Team | null>(null);
const members = ref<TeamMember[]>([]);
const membersLoading = ref(false);
const activeTab = ref<"members" | "inboxes" | "invitations" | "activity">(
  "members",
);

// Team inboxes
const teamInboxes = ref<TeamInbox[]>([]);
const inboxesLoading = ref(false);

// Invitations
const invitations = ref<TeamInvitationDetail[]>([]);
const invitationsLoading = ref(false);

// Activity log
const activity = ref<TeamActivity[]>([]);
const activityLoading = ref(false);

const canManage = computed(() => {
  const role = selectedTeam.value?.currentUserRole;
  return role === "owner" || role === "admin";
});

const detailTabs = computed(() => {
  const tabs: { key: string; label: string; count?: number }[] = [
    { key: "members", label: "Members", count: members.value.length },
    { key: "inboxes", label: "Inboxes", count: teamInboxes.value.length },
  ];
  if (canManage.value) {
    tabs.push({
      key: "invitations",
      label: "Invitations",
      count: invitations.value.length,
    });
  }
  tabs.push({ key: "activity", label: "Activity" });
  return tabs;
});

useHead({
  title: computed(() =>
    selectedTeam.value ? selectedTeam.value.name : "Team",
  ),
});

async function loadTeam() {
  loading.value = true;
  try {
    selectedTeam.value = await api.getTeam(teamId);
  } catch {
    selectedTeam.value = null;
    loading.value = false;
    return;
  }
  loading.value = false;

  membersLoading.value = true;
  inboxesLoading.value = true;
  invitationsLoading.value = true;
  activityLoading.value = true;

  api
    .getTeamMembers(teamId)
    .then((r) => {
      members.value = r;
    })
    .catch(() => {
      members.value = [];
    })
    .finally(() => {
      membersLoading.value = false;
    });

  api
    .getTeamInboxes(teamId)
    .then((r) => {
      teamInboxes.value = r;
    })
    .catch(() => {
      teamInboxes.value = [];
    })
    .finally(() => {
      inboxesLoading.value = false;
    });

  api
    .getTeamInvitations(teamId)
    .then((r) => {
      invitations.value = r;
    })
    .catch(() => {
      invitations.value = [];
    })
    .finally(() => {
      invitationsLoading.value = false;
    });

  api
    .getTeamActivity(teamId)
    .then((r) => {
      activity.value = r;
    })
    .catch(() => {
      activity.value = [];
    })
    .finally(() => {
      activityLoading.value = false;
    });
}

onMounted(loadTeam);

watch(activeTab, async (tab) => {
  if (tab === "activity") {
    activityLoading.value = true;
    try {
      activity.value = await api.getTeamActivity(teamId);
    } catch {
      activity.value = [];
    } finally {
      activityLoading.value = false;
    }
  }
});

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
    const updated = await api.updateTeam(selectedTeam.value.id, renameName.value);
    toast.success("Team renamed");
    selectedTeam.value = { ...selectedTeam.value, name: updated.name };
    showRenameModal.value = false;
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
    toast.success("Team deleted");
    navigateTo("/teams");
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
    toast.success("Member added");
    closeAddMemberModal();
    members.value = await api.getTeamMembers(teamId);
  } catch (e: any) {
    addMemberError.value = e?.data?.error || "Failed to add member";
  } finally {
    addingMember.value = false;
  }
}

async function handleRoleChange(member: TeamMember, newRole: string) {
  if (!selectedTeam.value || newRole === member.role) return;
  try {
    await api.updateTeamMemberRole(selectedTeam.value.id, member.userId, newRole);
    toast.success(`Role changed to ${newRole}`);
    members.value = await api.getTeamMembers(teamId);
  } catch {
    toast.error("Failed to change role");
  }
}

async function handleRemoveMember(member: TeamMember) {
  if (!selectedTeam.value) return;
  try {
    await api.removeTeamMember(selectedTeam.value.id, member.userId);
    toast.success("Member removed");
    members.value = await api.getTeamMembers(teamId);
  } catch {
    toast.error("Failed to remove member");
  }
}

// ─── Inboxes ───────────────────────────────────────────────
async function handleUnassignInbox(inbox: TeamInbox) {
  if (!selectedTeam.value) return;
  try {
    await api.updateInbox(inbox.id, { teamId: null });
    toast.success("Inbox unassigned from team");
    teamInboxes.value = await api.getTeamInboxes(teamId);
  } catch {
    toast.error("Failed to unassign inbox");
  }
}

// ─── Invitations ───────────────────────────────────────────
const showInviteModal = ref(false);
const inviteForm = reactive({ email: "", role: "member" });
const sendingInvite = ref(false);
const inviteError = ref("");

function closeInviteModal() {
  showInviteModal.value = false;
  inviteForm.email = "";
  inviteForm.role = "member";
  inviteError.value = "";
}

async function handleSendInvitation() {
  if (!selectedTeam.value) return;
  sendingInvite.value = true;
  inviteError.value = "";
  try {
    await api.sendTeamInvitation(
      selectedTeam.value.id,
      inviteForm.email,
      inviteForm.role,
    );
    toast.success(`Invitation sent to ${inviteForm.email}`);
    closeInviteModal();
    invitations.value = await api.getTeamInvitations(teamId);
    activity.value = await api.getTeamActivity(teamId);
  } catch (e: any) {
    inviteError.value = e?.data?.error || "Failed to send invitation";
  } finally {
    sendingInvite.value = false;
  }
}

async function handleRevokeInvitation(inv: TeamInvitationDetail) {
  if (!selectedTeam.value) return;
  try {
    await api.revokeTeamInvitation(selectedTeam.value.id, inv.id);
    toast.success("Invitation revoked");
    invitations.value = await api.getTeamInvitations(teamId);
  } catch {
    toast.error("Failed to revoke invitation");
  }
}

// ─── Activity helpers ──────────────────────────────────────
function activityIcon(action: string): string {
  const icons: Record<string, string> = {
    team_created: "lucide:plus-circle",
    team_updated: "lucide:edit",
    member_added: "lucide:user-plus",
    member_removed: "lucide:user-minus",
    member_role_changed: "lucide:shield",
    invitation_sent: "lucide:mail",
    invitation_accepted: "lucide:check-circle",
    inbox_assigned: "lucide:inbox",
    inbox_unassigned: "lucide:inbox",
  };
  return icons[action] || "lucide:activity";
}

function activityIconClass(action: string): string {
  const classes: Record<string, string> = {
    team_created:
      "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
    team_updated:
      "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    member_added:
      "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400",
    member_removed:
      "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
    member_role_changed:
      "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
    invitation_sent:
      "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
    invitation_accepted:
      "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  };
  return (
    classes[action] ||
    "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
  );
}

function activityDescription(entry: TeamActivity): string {
  const meta = entry.meta || {};
  const descriptions: Record<string, string> = {
    team_created: "created this team",
    team_updated: `renamed the team${meta.name ? ` to "${meta.name}"` : ""}`,
    member_added: `added a member as ${meta.role || "member"}`,
    member_removed: "removed a member",
    member_role_changed: `changed a member's role to ${meta.role || "member"}`,
    invitation_sent: `invited ${meta.email || "someone"} as ${meta.role || "member"}`,
    invitation_accepted: "accepted an invitation and joined the team",
    inbox_assigned: "assigned an inbox to this team",
    inbox_unassigned: "removed an inbox from this team",
  };
  return descriptions[entry.action] || entry.action;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
</script>
