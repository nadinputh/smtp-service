<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center"
    >
      <div class="flex items-center justify-between w-full">
        <div>
          <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
            {{ inbox?.name ?? "Inbox" }}
          </h2>
          <p class="text-sm text-gray-400">{{ totalMessages }} messages</p>
        </div>
        <div class="flex items-center gap-2">
          <!-- Export dropdown -->
          <div class="relative">
            <button
              @click="showExportMenu = !showExportMenu"
              class="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Icon name="lucide:download" class="w-4 h-4" />
              Export
            </button>
            <div
              v-if="showExportMenu"
              class="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-10 w-36"
            >
              <a
                :href="`/api/inboxes/${inboxId}/export?format=csv`"
                class="block px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                @click="showExportMenu = false"
              >
                Export as CSV
              </a>
              <a
                :href="`/api/inboxes/${inboxId}/export?format=mbox`"
                class="block px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                @click="showExportMenu = false"
              >
                Export as MBOX
              </a>
              <a
                :href="`/api/inboxes/${inboxId}/export?format=eml`"
                class="block px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                @click="showExportMenu = false"
              >
                Export as EML (ZIP)
              </a>
            </div>
          </div>
          <button
            @click="showCreds = !showCreds"
            class="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Icon name="lucide:key" class="w-4 h-4" />
            SMTP Credentials
          </button>
          <button
            @click="handleDelete"
            :disabled="deleting"
            class="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <Icon name="lucide:trash-2" class="w-4 h-4" />
            {{ deleting ? "Deleting..." : "Delete" }}
          </button>
        </div>
      </div>
    </header>

    <!-- SMTP Credentials panel -->
    <div
      v-if="showCreds && inboxDetail"
      class="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-sm space-y-2 shrink-0"
    >
      <p class="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        SMTP Settings
      </p>
      <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <span class="text-gray-500">Host:</span>
        <code class="text-gray-800">localhost</code>
        <span class="text-gray-500">Port:</span>
        <code class="text-gray-800">2525</code>
        <span class="text-gray-500">Username:</span>
        <div class="flex items-center gap-1">
          <code class="text-gray-800">{{ inboxDetail.smtpUsername }}</code>
          <button
            @click="copy(inboxDetail.smtpUsername)"
            class="text-gray-400 hover:text-indigo-600"
          >
            <Icon name="lucide:copy" class="w-3.5 h-3.5" />
          </button>
        </div>
        <span class="text-gray-500">Password:</span>
        <div class="flex items-center gap-1">
          <code class="text-gray-800">{{
            showPassword ? inboxDetail.smtpPassword : "••••••••••••"
          }}</code>
          <button
            @click="showPassword = !showPassword"
            class="text-gray-400 hover:text-indigo-600"
          >
            <Icon
              :name="showPassword ? 'lucide:eye-off' : 'lucide:eye'"
              class="w-3.5 h-3.5"
            />
          </button>
          <button
            @click="copy(inboxDetail.smtpPassword)"
            class="text-gray-400 hover:text-indigo-600"
          >
            <Icon name="lucide:copy" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Tab bar: Messages / Webhooks -->
    <div
      class="border-b border-gray-200 dark:border-gray-700 px-6 bg-white dark:bg-gray-800"
    >
      <nav class="flex gap-4 -mb-px">
        <button
          class="py-3 text-sm border-b-2 transition-colors"
          :class="
            activeTab === 'messages'
              ? 'border-indigo-500 text-indigo-600 font-medium'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          "
          @click="activeTab = 'messages'"
        >
          Messages ({{ totalMessages }})
        </button>
        <button
          class="py-3 text-sm border-b-2 transition-colors"
          :class="
            activeTab === 'webhooks'
              ? 'border-indigo-500 text-indigo-600 font-medium'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          "
          @click="activeTab = 'webhooks'"
        >
          Webhooks
        </button>
        <button
          class="py-3 text-sm border-b-2 transition-colors"
          :class="
            activeTab === 'members'
              ? 'border-indigo-500 text-indigo-600 font-medium'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          "
          @click="
            activeTab = 'members';
            loadMembers();
          "
        >
          Members
        </button>
      </nav>
    </div>

    <!-- Messages list -->
    <div
      v-if="activeTab === 'messages'"
      class="flex-1 overflow-y-auto flex flex-col"
    >
      <!-- Search & Filters -->
      <div
        class="px-6 py-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-2 shrink-0"
      >
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <Icon
              name="lucide:search"
              class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search by subject, from, or to..."
              class="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            @click="showFilters = !showFilters"
            class="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg transition-colors"
            :class="
              hasActiveFilters
                ? 'border-indigo-300 bg-indigo-50 text-indigo-600'
                : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            "
          >
            <Icon name="lucide:filter" class="w-4 h-4" />
            Filters
          </button>
          <button
            v-if="hasActiveFilters"
            @click="clearFilters"
            class="px-3 py-2 text-sm text-red-500 hover:text-red-700"
          >
            Clear
          </button>
        </div>
        <div v-if="showFilters" class="flex flex-wrap gap-2">
          <select
            v-model="filterStatus"
            class="px-2 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All statuses</option>
            <option value="received">Received</option>
            <option value="delivered">Delivered</option>
            <option value="bounced">Bounced</option>
            <option value="queued">Queued</option>
          </select>
          <input
            v-model="filterAfter"
            type="date"
            placeholder="After"
            class="px-2 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            v-model="filterBefore"
            type="date"
            placeholder="Before"
            class="px-2 py-1.5 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div v-if="pending" class="p-6 text-gray-400">Loading messages...</div>

      <div v-else-if="!messages?.length" class="p-6 text-center text-gray-400">
        <Icon name="lucide:inbox" class="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>
          {{
            searchQuery || hasActiveFilters
              ? "No messages match your search"
              : "No messages in this inbox yet"
          }}
        </p>
        <p v-if="!searchQuery && !hasActiveFilters" class="text-xs mt-1">
          Send an email to
          <code class="bg-gray-100 px-1 rounded">{{
            inboxDetail?.smtpUsername
          }}</code>
          on port 2525
        </p>
      </div>

      <ul v-else class="divide-y divide-gray-100 flex-1 overflow-y-auto">
        <li v-for="msg in messages" :key="msg.id">
          <NuxtLink
            :to="`/inbox/${inboxId}/message/${msg.id}`"
            class="block px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            :class="route.params.messageId === msg.id ? 'bg-indigo-50' : ''"
          >
            <div class="flex items-center justify-between">
              <span
                class="font-medium text-sm text-gray-800 dark:text-gray-100 truncate"
              >
                {{ msg.from }}
              </span>
              <span class="text-xs text-gray-400 shrink-0 ml-3">
                {{ formatDate(msg.date || msg.createdAt) }}
              </span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-300 truncate mt-0.5">
              {{ msg.subject || "(no subject)" }}
            </p>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-xs text-gray-400"
                >To: {{ msg.to.join(", ") }}</span
              >
              <span
                class="text-xs px-1.5 py-0.5 rounded-full"
                :class="
                  msg.status === 'received'
                    ? 'bg-green-100 text-green-700'
                    : msg.status === 'bounced'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-500'
                "
              >
                {{ msg.status }}
              </span>
            </div>
          </NuxtLink>
        </li>
      </ul>

      <!-- Pagination -->
      <div
        v-if="totalPages > 1"
        class="px-6 py-3 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between shrink-0"
      >
        <p class="text-xs text-gray-400">
          {{ totalMessages }} message{{ totalMessages === 1 ? "" : "s" }} · Page
          {{ currentPage }} of {{ totalPages }}
        </p>
        <div class="flex gap-1">
          <button
            :disabled="currentPage <= 1"
            @click="currentPage--"
            class="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:text-gray-300 rounded-lg disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Prev
          </button>
          <button
            :disabled="currentPage >= totalPages"
            @click="currentPage++"
            class="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:text-gray-300 rounded-lg disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Webhooks tab -->
    <div v-if="activeTab === 'webhooks'" class="flex-1 overflow-y-auto p-6">
      <div class="flex items-center justify-between mb-4">
        <p class="text-sm text-gray-500">Event notifications for this inbox</p>
        <button
          @click="showWebhookModal = true"
          class="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Icon name="lucide:plus" class="w-4 h-4" /> Add Webhook
        </button>
      </div>
      <div v-if="!webhooks?.length" class="text-center text-gray-400 py-8">
        <Icon name="lucide:webhook" class="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p class="text-sm">No webhooks configured</p>
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="wh in webhooks"
          :key="wh.id"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          <div class="p-3 flex items-center justify-between">
            <div>
              <code class="text-sm text-gray-800 dark:text-gray-100">{{
                wh.url
              }}</code>
              <div class="flex items-center gap-2 mt-1">
                <span
                  v-if="wh.onDelivered"
                  class="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700"
                  >delivered</span
                >
                <span
                  v-if="wh.onBounced"
                  class="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"
                  >bounced</span
                >
                <span
                  v-if="wh.onOpened"
                  class="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700"
                  >opened</span
                >
                <span
                  v-if="wh.onReceived"
                  class="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700"
                  >received</span
                >
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="toggleLogs(wh.id)"
                class="text-xs px-2 py-1 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50"
              >
                {{ expandedWebhook === wh.id ? "Hide" : "Logs" }}
              </button>
              <button
                @click="handleDeleteWebhook(wh.id)"
                class="text-xs px-2 py-1 border border-red-200 rounded-md text-red-600 hover:bg-red-50"
              >
                <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <!-- Delivery logs -->
          <div
            v-if="expandedWebhook === wh.id"
            class="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2"
          >
            <div v-if="webhookLogsLoading" class="text-xs text-gray-400 py-2">
              Loading logs...
            </div>
            <div
              v-else-if="!currentWebhookLogs.length"
              class="text-xs text-gray-400 py-2"
            >
              No delivery logs yet
            </div>
            <div v-else class="space-y-1.5 max-h-60 overflow-y-auto">
              <div
                v-for="log in currentWebhookLogs"
                :key="log.id"
                class="flex items-center justify-between bg-white dark:bg-gray-800 rounded px-2 py-1.5 text-xs border border-gray-100 dark:border-gray-700"
              >
                <div class="flex items-center gap-2">
                  <span
                    class="px-1.5 py-0.5 rounded-full font-medium"
                    :class="{
                      'bg-green-100 text-green-700': log.status === 'success',
                      'bg-red-100 text-red-700': log.status === 'failed',
                      'bg-yellow-100 text-yellow-700':
                        log.status === 'retrying',
                      'bg-gray-100 text-gray-500': log.status === 'pending',
                    }"
                    >{{ log.status }}</span
                  >
                  <span class="text-gray-500">{{ log.event }}</span>
                  <span v-if="log.statusCode" class="text-gray-400"
                    >HTTP {{ log.statusCode }}</span
                  >
                  <span class="text-gray-400">Attempt {{ log.attempt }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-gray-400">{{
                    formatDate(log.createdAt)
                  }}</span>
                  <button
                    v-if="log.status === 'failed'"
                    @click="handleRetryWebhookLog(wh.id, log.id)"
                    class="px-1.5 py-0.5 border border-indigo-200 rounded text-indigo-600 hover:bg-indigo-50"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Members Tab -->
    <div v-if="activeTab === 'members'" class="flex-1 overflow-y-auto p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Inbox Members
        </h3>
        <button
          @click="showInviteModal = true"
          class="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Invite Member
        </button>
      </div>

      <div v-if="membersLoading" class="text-sm text-gray-400">Loading...</div>
      <div v-else-if="!members.length" class="text-sm text-gray-400">
        No members yet. Invite someone to share this inbox.
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="member in members"
          :key="member.id"
          class="flex items-center gap-3 bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <div
            class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-semibold"
          >
            {{ (member.name || member.email).charAt(0).toUpperCase() }}
          </div>
          <div class="flex-1 min-w-0">
            <p
              class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate"
            >
              {{ member.name || member.email }}
            </p>
            <p class="text-xs text-gray-400">{{ member.email }}</p>
          </div>
          <span
            class="text-xs px-2 py-0.5 rounded-full font-medium"
            :class="{
              'bg-purple-100 text-purple-700': member.role === 'owner',
              'bg-blue-100 text-blue-700': member.role === 'editor',
              'bg-gray-100 text-gray-600': member.role === 'viewer',
            }"
          >
            {{ member.role }}
          </span>
          <select
            v-if="member.role !== 'owner' && member.id !== 'owner'"
            :value="member.role"
            @change="
              handleUpdateRole(
                member.id,
                ($event.target as HTMLSelectElement).value,
              )
            "
            class="text-xs border border-gray-200 rounded px-1.5 py-0.5"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            v-if="member.role !== 'owner' && member.id !== 'owner'"
            @click="handleRemoveMember(member.id)"
            class="text-xs text-red-500 hover:text-red-700"
          >
            Remove
          </button>
        </div>
      </div>
    </div>

    <!-- Invite Member Modal -->
    <Teleport to="body">
      <div
        v-if="showInviteModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="showInviteModal = false"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Invite Member
          </h2>
          <form @submit.prevent="handleInviteMember" class="space-y-3">
            <input
              v-model="inviteEmail"
              type="email"
              required
              placeholder="user@example.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              v-model="inviteRole"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <p v-if="inviteError" class="text-sm text-red-600">
              {{ inviteError }}
            </p>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                @click="showInviteModal = false"
                class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="inviting"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {{ inviting ? "Inviting..." : "Invite" }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Add Webhook Modal -->
    <Teleport to="body">
      <div
        v-if="showWebhookModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="showWebhookModal = false"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Add Webhook
          </h2>
          <form @submit.prevent="handleAddWebhook" class="space-y-3">
            <input
              v-model="webhookForm.url"
              type="url"
              required
              placeholder="https://your-endpoint.com/webhook"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <div class="flex flex-wrap gap-3 text-sm">
              <label class="flex items-center gap-1.5">
                <input
                  v-model="webhookForm.onDelivered"
                  type="checkbox"
                  class="rounded border-gray-300 text-indigo-600"
                />
                Delivered
              </label>
              <label class="flex items-center gap-1.5">
                <input
                  v-model="webhookForm.onBounced"
                  type="checkbox"
                  class="rounded border-gray-300 text-indigo-600"
                />
                Bounced
              </label>
              <label class="flex items-center gap-1.5">
                <input
                  v-model="webhookForm.onOpened"
                  type="checkbox"
                  class="rounded border-gray-300 text-indigo-600"
                />
                Opened
              </label>
            </div>
            <p v-if="webhookError" class="text-sm text-red-600">
              {{ webhookError }}
            </p>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                @click="showWebhookModal = false"
                class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="addingWebhook"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {{ addingWebhook ? "Adding..." : "Add" }}
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

const route = useRoute();
const api = useApi();
const inboxId = route.params.inboxId as string;

const showCreds = ref(false);
const showPassword = ref(false);
const showExportMenu = ref(false);
const deleting = ref(false);
const activeTab = ref<"messages" | "webhooks" | "members">("messages");

// Search & filter state
const searchQuery = ref("");
const filterStatus = ref("");
const filterAfter = ref("");
const filterBefore = ref("");
const showFilters = ref(false);
const currentPage = ref(1);
const totalMessages = ref(0);
const messages = ref<
  Awaited<ReturnType<typeof api.getInboxMessages>>["messages"]
>([]);
const pending = ref(false);

const hasActiveFilters = computed(
  () => filterStatus.value || filterAfter.value || filterBefore.value,
);

const totalPages = computed(() =>
  Math.max(1, Math.ceil(totalMessages.value / 50)),
);

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchQuery, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentPage.value = 1;
    fetchMessages();
  }, 300);
});

watch([filterStatus, filterAfter, filterBefore], () => {
  currentPage.value = 1;
  fetchMessages();
});

watch(currentPage, () => fetchMessages());

async function fetchMessages() {
  pending.value = true;
  try {
    const res = await api.getInboxMessages(inboxId, {
      q: searchQuery.value || undefined,
      status: filterStatus.value || undefined,
      after: filterAfter.value || undefined,
      before: filterBefore.value || undefined,
      page: currentPage.value,
      limit: 50,
    });
    messages.value = res.messages;
    totalMessages.value = res.total;
  } catch {
    messages.value = [];
    totalMessages.value = 0;
  } finally {
    pending.value = false;
  }
}

function clearFilters() {
  searchQuery.value = "";
  filterStatus.value = "";
  filterAfter.value = "";
  filterBefore.value = "";
  currentPage.value = 1;
}

// Webhooks state
const webhooks = ref<Awaited<ReturnType<typeof api.getWebhooks>> | null>(null);
const showWebhookModal = ref(false);
const addingWebhook = ref(false);
const webhookError = ref("");
const webhookForm = reactive({
  url: "",
  onDelivered: true,
  onBounced: true,
  onOpened: false,
});

// Webhook logs state
const expandedWebhook = ref<string | null>(null);
const currentWebhookLogs = ref<Awaited<ReturnType<typeof api.getWebhookLogs>>>(
  [],
);
const webhookLogsLoading = ref(false);

watch(activeTab, async (tab) => {
  if (tab === "webhooks" && !webhooks.value) {
    webhooks.value = await api.getWebhooks(inboxId);
  }
});

const { data: inboxDetail } = useAsyncData(`inbox-detail-${inboxId}`, () =>
  api.getInbox(inboxId),
);

// Keep backward compat for the template
const inbox = computed(() => inboxDetail.value);

// Initial fetch
fetchMessages();

// Real-time: refresh message list when a new email arrives in this inbox
useSSE((data) => {
  if (data.inboxId === inboxId) {
    fetchMessages();
  }
});

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function handleDelete() {
  if (!confirm("Delete this inbox and all its messages?")) return;
  deleting.value = true;
  try {
    await api.deleteInbox(inboxId);
    // Clear the inboxes cache so sidebar refreshes
    clearNuxtData("inboxes");
    navigateTo("/");
  } catch {
    alert("Failed to delete inbox");
  } finally {
    deleting.value = false;
  }
}

function copy(text: string) {
  navigator.clipboard.writeText(text);
}

async function handleAddWebhook() {
  webhookError.value = "";
  addingWebhook.value = true;
  try {
    await api.createWebhook(inboxId, webhookForm);
    showWebhookModal.value = false;
    webhookForm.url = "";
    webhooks.value = await api.getWebhooks(inboxId);
  } catch (e: any) {
    webhookError.value = e?.data?.error || "Failed to add webhook";
  } finally {
    addingWebhook.value = false;
  }
}

async function handleDeleteWebhook(webhookId: string) {
  if (!confirm("Delete this webhook?")) return;
  try {
    await api.deleteWebhook(inboxId, webhookId);
    webhooks.value = await api.getWebhooks(inboxId);
  } catch {
    alert("Failed to delete webhook");
  }
}

async function toggleLogs(webhookId: string) {
  if (expandedWebhook.value === webhookId) {
    expandedWebhook.value = null;
    return;
  }
  expandedWebhook.value = webhookId;
  webhookLogsLoading.value = true;
  try {
    currentWebhookLogs.value = await api.getWebhookLogs(inboxId, webhookId);
  } catch {
    currentWebhookLogs.value = [];
  } finally {
    webhookLogsLoading.value = false;
  }
}

async function handleRetryWebhookLog(webhookId: string, logId: string) {
  try {
    await api.retryWebhookLog(inboxId, webhookId, logId);
    // Refresh logs
    currentWebhookLogs.value = await api.getWebhookLogs(inboxId, webhookId);
  } catch {
    alert("Failed to retry webhook");
  }
}

// ─── Members ──────────────────────────────────────────────
import type { InboxMember } from "~/composables/useApi";

const members = ref<InboxMember[]>([]);
const membersLoading = ref(false);
const showInviteModal = ref(false);
const inviteEmail = ref("");
const inviteRole = ref("viewer");
const inviting = ref(false);
const inviteError = ref("");

async function loadMembers() {
  if (members.value.length) return;
  membersLoading.value = true;
  try {
    members.value = await api.getInboxMembers(inboxId);
  } catch {
    members.value = [];
  } finally {
    membersLoading.value = false;
  }
}

async function handleInviteMember() {
  inviteError.value = "";
  inviting.value = true;
  try {
    await api.addInboxMember(inboxId, inviteEmail.value, inviteRole.value);
    showInviteModal.value = false;
    inviteEmail.value = "";
    inviteRole.value = "viewer";
    members.value = await api.getInboxMembers(inboxId);
  } catch (e: any) {
    inviteError.value = e?.data?.error || "Failed to invite member";
  } finally {
    inviting.value = false;
  }
}

async function handleUpdateRole(memberId: string, newRole: string) {
  try {
    await api.updateInboxMemberRole(inboxId, memberId, newRole);
    members.value = await api.getInboxMembers(inboxId);
  } catch {
    alert("Failed to update role");
  }
}

async function handleRemoveMember(memberId: string) {
  if (!confirm("Remove this member?")) return;
  try {
    await api.removeInboxMember(inboxId, memberId);
    members.value = await api.getInboxMembers(inboxId);
  } catch {
    alert("Failed to remove member");
  }
}
</script>
