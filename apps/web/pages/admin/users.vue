<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 py-3 min-h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h1 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          User Management
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Manage users and assign roles
        </p>
      </div>
      <UBtn size="sm" class="self-start sm:self-auto" @click="showCreateModal = true">
        <Icon name="lucide:plus" class="w-4 h-4" /> Create User
      </UBtn>
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

      <div v-if="loading" class="text-gray-500 dark:text-gray-400">
        Loading...
      </div>

      <div v-else-if="loadError" class="text-center py-12">
        <Icon
          name="lucide:alert-circle"
          class="w-10 h-10 mx-auto mb-3 text-red-500"
        />
        <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Couldn't load users
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Something went wrong fetching the user list.
        </p>
        <UBtn size="sm" @click="fetchUsers">Retry</UBtn>
      </div>

      <div
        v-else-if="!usersData?.data.length"
        class="text-center text-gray-500 dark:text-gray-400 py-12"
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
                  class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
                >
                  {{ formatDate(u.createdAt) }}
                </td>
                <td class="px-4 py-3 text-right whitespace-nowrap">
                  <UBtn
                    variant="secondary"
                    size="xs"
                    class="min-h-11"
                    @click="openEditModal(u)"
                  >
                    Edit
                  </UBtn>
                  <UBtn
                    variant="secondary"
                    size="xs"
                    class="ml-2 min-h-11"
                    @click="openPasswordModal(u)"
                  >
                    Set Password
                  </UBtn>
                  <UBtn
                    v-if="u.id !== currentUser?.id"
                    variant="danger"
                    size="xs"
                    class="ml-2 min-h-11"
                    @click="confirmDelete(u)"
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
          v-if="usersData.pagination.pages > 1"
          class="flex items-center justify-between pt-4"
        >
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Page {{ usersData.pagination.page }} of
            {{ usersData.pagination.pages }} ({{ usersData.pagination.total }}
            users)
          </p>
          <div class="flex gap-2">
            <UBtn
              variant="secondary"
              size="xs"
              :disabled="page <= 1"
              @click="
                page--;
                fetchUsers();
              "
            >
              Previous
            </UBtn>
            <UBtn
              variant="secondary"
              size="xs"
              :disabled="page >= usersData.pagination.pages"
              @click="
                page++;
                fetchUsers();
              "
            >
              Next
            </UBtn>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <Modal v-if="editUser" title="Edit User" title-class="mb-0" @close="editUser = null">
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {{ editUser?.email }}
      </p>
      <form @submit.prevent="handleEdit">
        <label
          for="edit-user-name"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Name
        </label>
        <input
          id="edit-user-name"
          v-model="editForm.name"
          type="text"
          placeholder="Name"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
        />
        <label
          for="edit-user-role"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Role
        </label>
        <select
          id="edit-user-role"
          v-model="editForm.role"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
          @change="pendingRoleConfirm = null"
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <p
          v-if="editError"
          role="alert"
          class="text-sm text-red-600 dark:text-red-400 mb-2"
        >
          {{ editError }}
        </p>
        <div
          v-if="pendingRoleConfirm"
          class="mb-2 p-3 rounded-lg border"
          :class="
            pendingRoleConfirm === 'escalate'
              ? 'border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20'
              : 'border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
          "
        >
          <p
            class="text-sm font-medium mb-1"
            :class="
              pendingRoleConfirm === 'escalate'
                ? 'text-orange-700 dark:text-orange-400'
                : 'text-red-700 dark:text-red-400'
            "
          >
            <template v-if="pendingRoleConfirm === 'escalate'">
              Confirm admin access for {{ editUser?.email }}?
            </template>
            <template v-else-if="editUser?.id === currentUser?.id">
              Remove your own admin access?
            </template>
            <template v-else>
              Remove admin access from {{ editUser?.email }}?
            </template>
          </p>
          <p
            class="text-xs mb-3"
            :class="
              pendingRoleConfirm === 'escalate'
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-red-600 dark:text-red-400'
            "
          >
            <template v-if="pendingRoleConfirm === 'escalate'">
              Admins can manage all users, teams, and inboxes across the
              system. This grants elevated access.
            </template>
            <template v-else-if="editUser?.id === currentUser?.id">
              You'll immediately lose access to this admin section after
              saving.
            </template>
            <template v-else>
              {{ editUser?.email }} will lose the ability to manage
              users, teams, and inboxes across the system.
            </template>
          </p>
          <div class="flex justify-end gap-2">
            <UBtn
              type="button"
              variant="ghost"
              size="xs"
              @click="pendingRoleConfirm = null"
            >
              Cancel
            </UBtn>
            <UBtn
              type="button"
              :variant="
                pendingRoleConfirm === 'escalate' ? 'warning' : 'danger-filled'
              "
              size="xs"
              :disabled="saving"
              @click="submitEdit"
            >
              {{
                saving
                  ? "Saving..."
                  : pendingRoleConfirm === "escalate"
                    ? "Confirm Admin Access"
                    : "Remove Admin Access"
              }}
            </UBtn>
          </div>
        </div>
        <div v-else class="flex justify-end gap-2 mt-4">
          <UBtn type="button" variant="ghost" @click="editUser = null">
            Cancel
          </UBtn>
          <UBtn type="submit" :disabled="saving">
            {{ saving ? "Saving..." : "Save" }}
          </UBtn>
        </div>
      </form>
    </Modal>

    <!-- Delete Confirmation -->
    <Modal
      v-if="deleteTarget"
      title="Delete User"
      title-class="mb-2"
      @close="deleteTarget = null"
    >
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Are you sure you want to delete
        <strong>{{ deleteTarget.email }}</strong
        >? Any inboxes or teams they own may lose their owner and access
        could be affected. This action cannot be undone.
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

    <!-- Create User Modal -->
    <Modal v-if="showCreateModal" title="Create User" @close="showCreateModal = false">
      <form @submit.prevent="handleCreate">
        <label
          for="create-user-email"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Email <span class="text-red-500 dark:text-red-400">*</span>
        </label>
        <input
          id="create-user-email"
          v-model="createForm.email"
          type="email"
          required
          placeholder="user@example.com"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
        />
        <label
          for="create-user-password"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Password <span class="text-red-500 dark:text-red-400">*</span>
        </label>
        <PasswordInput
          id="create-user-password"
          v-model="createForm.password"
          required
          minlength="8"
          autocomplete="new-password"
          placeholder="Min 8 characters"
        />
        <div class="mb-3">
          <PasswordChecklist :password="createForm.password" />
        </div>
        <label
          for="create-user-name"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Name
        </label>
        <input
          id="create-user-name"
          v-model="createForm.name"
          type="text"
          placeholder="Optional"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
        />
        <label
          for="create-user-role"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Role
        </label>
        <select
          id="create-user-role"
          v-model="createForm.role"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
        >
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
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

    <!-- Set Password Modal -->
    <Modal
      v-if="passwordTarget"
      title="Set Password"
      title-class="mb-2"
      @close="passwordTarget = null"
    >
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Set a new password for
        <strong>{{ passwordTarget.email }}</strong>
      </p>
      <form @submit.prevent="handleSetPassword">
        <label
          for="password-new"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          New Password <span class="text-red-500 dark:text-red-400">*</span>
        </label>
        <PasswordInput
          id="password-new"
          v-model="passwordForm.password"
          required
          minlength="8"
          autocomplete="new-password"
          placeholder="Min 8 characters"
        />
        <div class="mb-3">
          <PasswordChecklist :password="passwordForm.password" />
        </div>
        <label
          for="password-confirm"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Confirm Password <span class="text-red-500 dark:text-red-400">*</span>
        </label>
        <div class="mb-3">
          <PasswordInput
            id="password-confirm"
            v-model="passwordForm.confirm"
            required
            minlength="8"
            autocomplete="new-password"
            placeholder="Repeat password"
          />
        </div>
        <p
          v-if="passwordError"
          role="alert"
          class="text-sm text-red-600 dark:text-red-400 mb-2"
        >
          {{ passwordError }}
        </p>
        <p
          v-if="passwordSuccess"
          role="status"
          aria-live="polite"
          class="text-sm text-green-600 dark:text-green-400 mb-2"
        >
          {{ passwordSuccess }}
        </p>
        <div class="flex justify-end gap-2 mt-4">
          <UBtn
            type="button"
            variant="ghost"
            @click="passwordTarget = null"
          >
            Cancel
          </UBtn>
          <UBtn type="submit" :disabled="settingPassword">
            {{ settingPassword ? "Setting..." : "Set Password" }}
          </UBtn>
        </div>
      </form>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import type { AdminUser, PaginatedUsers } from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "User Management" });

const api = useApi();
const toast = useToast();
const { user: currentUser } = useAuth();

const loading = ref(true);
const loadError = ref(false);
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
  loadError.value = false;
  try {
    usersData.value = await api.getAdminUsers({
      page: page.value,
      limit: 25,
      search: search.value || undefined,
    });
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchUsers();
});

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});

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
    toast.success(`User "${createForm.email}" created`);
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
const editOriginalRole = ref("");
const pendingRoleConfirm = ref<null | "escalate" | "de-escalate">(null);
const editError = ref("");
const saving = ref(false);

function openEditModal(u: AdminUser) {
  editUser.value = u;
  editForm.name = u.name ?? "";
  editForm.role = u.role;
  editOriginalRole.value = u.role;
  pendingRoleConfirm.value = null;
  editError.value = "";
}

function handleEdit() {
  if (!editUser.value) return;
  // Any role change — in either direction — requires an explicit extra
  // confirmation step, since de-escalation can lock the actor out just as
  // easily as escalation can over-grant access.
  if (editForm.role !== editOriginalRole.value && !pendingRoleConfirm.value) {
    pendingRoleConfirm.value = editForm.role === "admin" ? "escalate" : "de-escalate";
    return;
  }
  submitEdit();
}

async function submitEdit() {
  if (!editUser.value) return;
  saving.value = true;
  editError.value = "";
  try {
    await api.updateAdminUser(editUser.value.id, {
      name: editForm.name || undefined,
      role: editForm.role,
    });
    toast.success(`User "${editUser.value.email}" updated`);
    pendingRoleConfirm.value = null;
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
    toast.success(`User "${deleteTarget.value.email}" deleted`);
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
