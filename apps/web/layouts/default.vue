<template>
  <div class="flex h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Sidebar -->
    <aside
      class="w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col"
    >
      <div
        class="px-4 h-20 flex items-center shrink-0 border-b border-gray-200 dark:border-gray-700"
      >
        <h1
          class="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"
        >
          <Icon name="lucide:mail" class="w-6 h-6 text-indigo-600" />
          SMTP Service
        </h1>
      </div>

      <!-- Inbox list -->
      <nav class="flex-1 overflow-y-auto p-3">
        <div class="flex items-center justify-between mb-2 px-2">
          <p
            class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
          >
            Inboxes
          </p>
          <button
            @click="showCreateModal = true"
            class="text-gray-400 hover:text-indigo-600 dark:text-gray-500 dark:hover:text-indigo-400 transition-colors"
            title="Create inbox"
          >
            <Icon name="lucide:plus" class="w-4 h-4" />
          </button>
        </div>
        <div
          v-if="pending"
          class="text-sm text-gray-400 dark:text-gray-500 px-2"
        >
          Loading...
        </div>
        <ul v-else-if="inboxes?.length" class="space-y-1">
          <li v-for="inbox in inboxes" :key="inbox.id">
            <NuxtLink
              :to="`/inbox/${inbox.id}`"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.params.inboxId === inbox.id
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon name="lucide:inbox" class="w-4 h-4 shrink-0" />
              <span class="truncate">{{ inbox.name }}</span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="text-sm text-gray-400 dark:text-gray-500 px-2">
          No inboxes yet
        </p>

        <!-- Settings links -->
        <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p
            class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-2"
          >
            Settings
          </p>
          <div class="space-y-1">
            <NuxtLink
              to="/"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.path === '/'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon name="lucide:bar-chart-3" class="w-4 h-4 shrink-0" />
              <span>Dashboard</span>
            </NuxtLink>
            <NuxtLink
              to="/domains"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.path === '/domains'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon name="lucide:globe" class="w-4 h-4 shrink-0" />
              <span>Domains</span>
            </NuxtLink>
            <NuxtLink
              to="/send"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.path === '/send'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon name="lucide:send" class="w-4 h-4 shrink-0" />
              <span>Send Email</span>
            </NuxtLink>
            <NuxtLink
              to="/templates"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.path === '/templates'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon name="lucide:file-text" class="w-4 h-4 shrink-0" />
              <span>Templates</span>
            </NuxtLink>
            <NuxtLink
              to="/suppressions"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.path === '/suppressions'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon name="lucide:shield-off" class="w-4 h-4 shrink-0" />
              <span>Suppressions</span>
            </NuxtLink>
            <NuxtLink
              to="/api-keys"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.path === '/api-keys'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon name="lucide:key" class="w-4 h-4 shrink-0" />
              <span>API Keys</span>
            </NuxtLink>
            <NuxtLink
              to="/teams"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.path === '/teams'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon name="lucide:users-round" class="w-4 h-4 shrink-0" />
              <span>Teams</span>
            </NuxtLink>
            <NuxtLink
              to="/settings"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.path === '/settings'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon name="lucide:settings" class="w-4 h-4 shrink-0" />
              <span>Settings</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Admin section (visible only for admins) -->
        <div
          v-if="user?.role === 'admin'"
          class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700"
        >
          <p
            class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-2"
          >
            Admin
          </p>
          <div class="space-y-1">
            <NuxtLink
              to="/admin/users"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.path === '/admin/users'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon name="lucide:shield" class="w-4 h-4 shrink-0" />
              <span>User Management</span>
            </NuxtLink>
          </div>
        </div>
      </nav>

      <!-- User footer -->
      <div class="p-3 border-t border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-2 px-2">
          <Icon
            name="lucide:user"
            class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"
          />
          <span
            class="text-sm text-gray-600 dark:text-gray-300 truncate flex-1"
            >{{ user?.email }}</span
          >
          <button
            @click="darkMode.toggle()"
            class="text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            :title="
              darkMode.isDark.value
                ? 'Switch to light mode'
                : 'Switch to dark mode'
            "
          >
            <Icon
              :name="darkMode.isDark.value ? 'lucide:sun' : 'lucide:moon'"
              class="w-4 h-4"
            />
          </button>
          <button
            @click="logout()"
            class="text-gray-400 hover:text-red-500 transition-colors"
            title="Sign out"
          >
            <Icon name="lucide:log-out" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
      <slot />
    </main>

    <!-- Create Inbox Modal -->
    <Teleport to="body">
      <div
        v-if="showCreateModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="showCreateModal = false"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2 class="text-lg font-semibold text-gray-800 mb-4">Create Inbox</h2>
          <form @submit.prevent="handleCreateInbox">
            <input
              v-model="newInboxName"
              type="text"
              required
              placeholder="Inbox name"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p v-if="createError" class="text-sm text-red-600 mt-2">
              {{ createError }}
            </p>
            <div class="flex justify-end gap-2 mt-4">
              <button
                type="button"
                @click="showCreateModal = false"
                class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="creating"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
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
const route = useRoute();
const api = useApi();
const { user, logout } = useAuth();
const darkMode = useDarkMode();

onMounted(() => {
  darkMode.init();
});

const {
  data: inboxes,
  pending,
  refresh: refreshInboxes,
} = useAsyncData("inboxes", () => api.getInboxes());

// Real-time: refresh inbox list when a new email arrives
useSSE((_data) => {
  refreshInboxes();
});

// ─── Create Inbox ─────────────────────────────────────────
const showCreateModal = ref(false);
const newInboxName = ref("");
const creating = ref(false);
const createError = ref("");

async function handleCreateInbox() {
  createError.value = "";
  creating.value = true;
  try {
    const inbox = await api.createInbox(newInboxName.value);
    showCreateModal.value = false;
    newInboxName.value = "";
    await refreshInboxes();
    navigateTo(`/inbox/${inbox.id}`);
  } catch (e: any) {
    createError.value = e?.data?.error || "Failed to create inbox";
  } finally {
    creating.value = false;
  }
}
</script>
