<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          User Management
        </h2>
        <p class="text-sm text-gray-400 dark:text-gray-500">
          Manage users and assign roles
        </p>
      </div>
      <button
        @click="showCreateModal = true"
        class="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
      >
        <Icon name="lucide:plus" class="w-4 h-4" /> Create User
      </button>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <!-- Search -->
      <div class="mb-4">
        <input
          v-model="search"
          type="text"
          placeholder="Search by email..."
          class="w-full max-w-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          @input="debouncedFetch"
        />
      </div>

      <div v-if="loading" class="text-gray-400 dark:text-gray-500">
        Loading...
      </div>

      <div
        v-else-if="!usersData?.data.length"
        class="text-center text-gray-400 dark:text-gray-500 py-12"
      >
        <Icon name="lucide:users" class="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No users found</p>
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
                <th class="px-4 py-3">Name</th>
                <th class="px-4 py-3">Role</th>
                <th class="px-4 py-3">Joined</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="u in usersData.data"
                :key="u.id"
                class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td
                  class="px-4 py-3 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap"
                >
                  {{ u.email }}
                </td>
                <td
                  class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
                >
                  {{ u.name || "—" }}
                </td>
                <td class="px-4 py-3 whitespace-nowrap">
                  <span
                    :class="
                      u.role === 'admin'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    "
                    class="text-xs px-2 py-0.5 rounded-full font-medium"
                  >
                    {{ u.role }}
                  </span>
                </td>
                <td
                  class="px-4 py-3 text-gray-400 dark:text-gray-500 whitespace-nowrap"
                >
                  {{ formatDate(u.createdAt) }}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    @click="openEditModal(u)"
                    class="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    @click="openPasswordModal(u)"
                    class="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ml-1"
                  >
                    Set Password
                  </button>
                  <button
                    v-if="u.id !== currentUser?.id"
                    @click="confirmDelete(u)"
                    class="text-xs px-3 py-1.5 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ml-1"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div
          v-if="usersData.pagination.pages > 1"
          class="flex items-center justify-between pt-4"
        >
          <p class="text-xs text-gray-400 dark:text-gray-500">
            Page {{ usersData.pagination.page }} of
            {{ usersData.pagination.pages }} ({{ usersData.pagination.total }}
            users)
          </p>
          <div class="flex gap-2">
            <button
              :disabled="page <= 1"
              @click="
                page--;
                fetchUsers();
              "
              class="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <button
              :disabled="page >= usersData.pagination.pages"
              @click="
                page++;
                fetchUsers();
              "
              class="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <Teleport to="body">
      <div
        v-if="editUser"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="editUser = null"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Edit User
          </h2>
          <form @submit.prevent="handleEdit">
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Name
            </label>
            <input
              v-model="editForm.name"
              type="text"
              placeholder="Name"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
            />
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Role
            </label>
            <select
              v-model="editForm.role"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <p
              v-if="editError"
              class="text-sm text-red-600 dark:text-red-400 mb-2"
            >
              {{ editError }}
            </p>
            <div class="flex justify-end gap-2 mt-4">
              <button
                type="button"
                @click="editUser = null"
                class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="saving"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {{ saving ? "Saving..." : "Save" }}
              </button>
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
            Delete User
          </h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Are you sure you want to delete
            <strong>{{ deleteTarget.email }}</strong
            >? This action cannot be undone.
          </p>
          <p
            v-if="deleteError"
            class="text-sm text-red-600 dark:text-red-400 mb-2"
          >
            {{ deleteError }}
          </p>
          <div class="flex justify-end gap-2">
            <button
              @click="deleteTarget = null"
              class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              @click="handleDelete"
              :disabled="deleting"
              class="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {{ deleting ? "Deleting..." : "Delete" }}
            </button>
          </div>
        </div>
      </div>

      <!-- Create User Modal -->
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
            Create User
          </h2>
          <form @submit.prevent="handleCreate">
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Email <span class="text-red-500">*</span>
            </label>
            <input
              v-model="createForm.email"
              type="email"
              required
              placeholder="user@example.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
            />
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Password <span class="text-red-500">*</span>
            </label>
            <input
              v-model="createForm.password"
              type="password"
              required
              minlength="6"
              placeholder="Min 6 characters"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
            />
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Name
            </label>
            <input
              v-model="createForm.name"
              type="text"
              placeholder="Optional"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
            />
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Role
            </label>
            <select
              v-model="createForm.role"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <p
              v-if="createError"
              class="text-sm text-red-600 dark:text-red-400 mb-2"
            >
              {{ createError }}
            </p>
            <div class="flex justify-end gap-2 mt-4">
              <button
                type="button"
                @click="showCreateModal = false"
                class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
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

      <!-- Set Password Modal -->
      <div
        v-if="passwordTarget"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        @click.self="passwordTarget = null"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2"
          >
            Set Password
          </h2>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Set a new password for
            <strong>{{ passwordTarget.email }}</strong>
          </p>
          <form @submit.prevent="handleSetPassword">
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              New Password <span class="text-red-500">*</span>
            </label>
            <input
              v-model="passwordForm.password"
              type="password"
              required
              minlength="6"
              placeholder="Min 6 characters"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
            />
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              Confirm Password <span class="text-red-500">*</span>
            </label>
            <input
              v-model="passwordForm.confirm"
              type="password"
              required
              minlength="6"
              placeholder="Repeat password"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
            />
            <p
              v-if="passwordError"
              class="text-sm text-red-600 dark:text-red-400 mb-2"
            >
              {{ passwordError }}
            </p>
            <p
              v-if="passwordSuccess"
              class="text-sm text-green-600 dark:text-green-400 mb-2"
            >
              {{ passwordSuccess }}
            </p>
            <div class="flex justify-end gap-2 mt-4">
              <button
                type="button"
                @click="passwordTarget = null"
                class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="settingPassword"
                class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {{ settingPassword ? "Setting..." : "Set Password" }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { AdminUser, PaginatedUsers } from "~/composables/useApi";

definePageMeta({ layout: "default" });

const api = useApi();
const { user: currentUser } = useAuth();

const loading = ref(true);
const usersData = ref<PaginatedUsers | null>(null);
const search = ref("");
const page = ref(1);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedFetch() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    page.value = 1;
    fetchUsers();
  }, 300);
}

async function fetchUsers() {
  loading.value = true;
  try {
    usersData.value = await api.getAdminUsers({
      page: page.value,
      limit: 25,
      search: search.value || undefined,
    });
  } catch {
    // Silently fail — user will see empty state
  } finally {
    loading.value = false;
  }
}

onMounted(fetchUsers);

// ─── Create ────────────────────────────────────────────────
const showCreateModal = ref(false);
const createForm = reactive({
  email: "",
  password: "",
  name: "",
  role: "user",
});
const createError = ref("");
const creating = ref(false);

async function handleCreate() {
  creating.value = true;
  createError.value = "";
  try {
    await api.createAdminUser({
      email: createForm.email,
      password: createForm.password,
      name: createForm.name || undefined,
      role: createForm.role,
    });
    showCreateModal.value = false;
    createForm.email = "";
    createForm.password = "";
    createForm.name = "";
    createForm.role = "user";
    await fetchUsers();
  } catch (e: any) {
    createError.value = e?.data?.error || "Failed to create user";
  } finally {
    creating.value = false;
  }
}

// ─── Edit ──────────────────────────────────────────────────
const editUser = ref<AdminUser | null>(null);
const editForm = reactive({ name: "", role: "user" });
const editError = ref("");
const saving = ref(false);

function openEditModal(u: AdminUser) {
  editUser.value = u;
  editForm.name = u.name ?? "";
  editForm.role = u.role;
  editError.value = "";
}

async function handleEdit() {
  if (!editUser.value) return;
  saving.value = true;
  editError.value = "";
  try {
    await api.updateAdminUser(editUser.value.id, {
      name: editForm.name || undefined,
      role: editForm.role,
    });
    editUser.value = null;
    await fetchUsers();
  } catch (e: any) {
    editError.value = e?.data?.error || "Failed to update user";
  } finally {
    saving.value = false;
  }
}

// ─── Delete ────────────────────────────────────────────────
const deleteTarget = ref<AdminUser | null>(null);
const deleteError = ref("");
const deleting = ref(false);

function confirmDelete(u: AdminUser) {
  deleteTarget.value = u;
  deleteError.value = "";
}

async function handleDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  deleteError.value = "";
  try {
    await api.deleteAdminUser(deleteTarget.value.id);
    deleteTarget.value = null;
    await fetchUsers();
  } catch (e: any) {
    deleteError.value = e?.data?.error || "Failed to delete user";
  } finally {
    deleting.value = false;
  }
}

// ─── Set Password ──────────────────────────────────────────
const passwordTarget = ref<AdminUser | null>(null);
const passwordForm = reactive({ password: "", confirm: "" });
const passwordError = ref("");
const passwordSuccess = ref("");
const settingPassword = ref(false);

function openPasswordModal(u: AdminUser) {
  passwordTarget.value = u;
  passwordForm.password = "";
  passwordForm.confirm = "";
  passwordError.value = "";
  passwordSuccess.value = "";
}

async function handleSetPassword() {
  if (!passwordTarget.value) return;
  passwordError.value = "";
  passwordSuccess.value = "";

  if (passwordForm.password !== passwordForm.confirm) {
    passwordError.value = "Passwords do not match";
    return;
  }

  settingPassword.value = true;
  try {
    await api.setAdminUserPassword(
      passwordTarget.value.id,
      passwordForm.password,
    );
    passwordSuccess.value = "Password updated successfully";
    passwordForm.password = "";
    passwordForm.confirm = "";
    setTimeout(() => {
      passwordTarget.value = null;
    }, 1500);
  } catch (e: any) {
    passwordError.value = e?.data?.error || "Failed to set password";
  } finally {
    settingPassword.value = false;
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
