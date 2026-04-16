<template>
  <div class="flex h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Mobile overlay backdrop -->
    <div
      v-if="sidebar.isOpen.value"
      class="fixed inset-0 bg-black/40 z-30 lg:hidden"
      @click="sidebar.close()"
    />

    <!-- Sidebar -->
    <aside
      class="fixed inset-y-0 left-0 z-40 w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-transform duration-300 ease-in-out lg:static lg:translate-x-0"
      :class="sidebar.isOpen.value ? 'translate-x-0' : '-translate-x-full'"
    >
      <div
        class="px-4 h-20 flex items-center justify-between shrink-0 border-b border-gray-200 dark:border-gray-700"
      >
        <h1
          class="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"
        >
          <Icon name="lucide:mail" class="w-6 h-6 text-indigo-600" />
          SMTP Service
        </h1>
        <!-- Close button (mobile only) -->
        <button
          @click="sidebar.close()"
          class="lg:hidden text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
        >
          <Icon name="lucide:x" class="w-5 h-5" />
        </button>
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

        <!-- Navigation -->
        <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p
            class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-2"
          >
            Mail
          </p>
          <div class="space-y-1">
            <NuxtLink
              v-for="item in mailNav"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.path === item.to
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon :name="item.icon" class="w-4 h-4 shrink-0" />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </div>
        </div>

        <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <p
            class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-2"
          >
            Manage
          </p>
          <div class="space-y-1">
            <NuxtLink
              v-for="item in manageNav"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.path === item.to
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon :name="item.icon" class="w-4 h-4 shrink-0" />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </div>
        </div>

        <!-- Admin section -->
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
              v-for="item in adminNav"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="
                route.path === item.to
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              "
            >
              <Icon :name="item.icon" class="w-4 h-4 shrink-0" />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </div>
        </div>
      </nav>

      <!-- User profile footer -->
      <div class="border-t border-gray-200 dark:border-gray-700 relative">
        <!-- Profile popover -->
        <Transition
          enter-active-class="transition ease-out duration-150"
          enter-from-class="opacity-0 translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition ease-in duration-100"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-2"
        >
          <div
            v-if="showProfileMenu"
            class="absolute bottom-full left-3 right-3 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden z-10"
          >
            <!-- User info -->
            <div
              class="px-4 py-3 border-b border-gray-100 dark:border-gray-700"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <p
                      class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate"
                    >
                      {{ user?.name || user?.email }}
                    </p>
                    <span
                      class="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                      :class="
                        user?.role === 'admin'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      "
                    >
                      {{ user?.role }}
                    </span>
                  </div>
                  <p
                    v-if="user?.name"
                    class="text-xs text-gray-400 dark:text-gray-500 truncate"
                  >
                    {{ user?.email }}
                  </p>
                </div>
                <NuxtLink
                  to="/settings"
                  @click="showProfileMenu = false"
                  class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0 mt-0.5"
                  title="Settings"
                >
                  <Icon name="lucide:settings" class="w-4 h-4" />
                </NuxtLink>
              </div>
            </div>

            <!-- Menu items -->
            <div class="py-1.5">
              <!-- Theme selector -->
              <div class="px-4 py-2">
                <div
                  class="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5"
                >
                  <button
                    v-for="opt in themeOptions"
                    :key="opt.value"
                    @click="darkMode.setMode(opt.value)"
                    class="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors"
                    :class="
                      darkMode.mode.value === opt.value
                        ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    "
                  >
                    <Icon :name="opt.icon" class="w-3.5 h-3.5" />
                    {{ opt.label }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Sign out -->
            <div class="border-t border-gray-100 dark:border-gray-700 py-1.5">
              <button
                @click="logout()"
                class="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Icon name="lucide:log-out" class="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </Transition>

        <!-- Profile button -->
        <button
          @click="showProfileMenu = !showProfileMenu"
          class="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div
            class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-semibold shrink-0"
          >
            {{ (user?.name || user?.email || "?").charAt(0).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1 text-left">
            <p
              class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate"
            >
              {{ user?.name || user?.email }}
            </p>
            <p
              v-if="user?.name"
              class="text-xs text-gray-400 dark:text-gray-500 truncate"
            >
              {{ user?.email }}
            </p>
          </div>
          <Icon
            name="lucide:chevrons-up-down"
            class="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0"
          />
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <main
      class="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900 flex flex-col"
    >
      <!-- Mobile header -->
      <div
        class="lg:hidden flex items-center h-14 px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0"
      >
        <button
          @click="sidebar.open()"
          class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
        >
          <Icon name="lucide:menu" class="w-6 h-6" />
        </button>
        <span
          class="ml-3 text-lg font-semibold text-gray-800 dark:text-gray-100"
          >SMTP Service</span
        >
      </div>
      <div class="flex-1 overflow-hidden">
        <slot />
      </div>
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
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Create Inbox
          </h2>
          <form @submit.prevent="handleCreateInbox">
            <input
              v-model="newInboxName"
              type="text"
              required
              placeholder="Inbox name"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p v-if="createError" class="text-sm text-red-600 mt-2">
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
const route = useRoute();
const api = useApi();
const { user, logout } = useAuth();
const darkMode = useDarkMode();
const sidebar = useSidebar();

// ─── Navigation data ──────────────────────────────────────
const mailNav = [
  { to: "/", icon: "lucide:bar-chart-3", label: "Dashboard" },
  { to: "/send", icon: "lucide:send", label: "Send Email" },
  { to: "/templates", icon: "lucide:file-text", label: "Templates" },
];

const themeOptions = [
  { value: "light" as const, icon: "lucide:sun", label: "Light" },
  { value: "dark" as const, icon: "lucide:moon", label: "Dark" },
  { value: "system" as const, icon: "lucide:monitor", label: "System" },
];

const manageNav = [
  { to: "/domains", icon: "lucide:globe", label: "Domains" },
  { to: "/suppressions", icon: "lucide:shield-off", label: "Suppressions" },
  { to: "/api-keys", icon: "lucide:key", label: "API Keys" },
  { to: "/teams", icon: "lucide:users-round", label: "Teams" },
];

const adminNav = [
  { to: "/admin/users", icon: "lucide:shield", label: "User Management" },
];

// ─── Profile popover ──────────────────────────────────────
const showProfileMenu = ref(false);

onMounted(() => {
  darkMode.init();
});

// Close sidebar & profile popover on route change
watch(
  () => route.fullPath,
  () => {
    sidebar.close();
    showProfileMenu.value = false;
  },
);

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
