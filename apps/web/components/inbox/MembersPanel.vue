<script setup lang="ts">
import type { InboxMember } from "~/composables/useApi";

const props = defineProps<{ inboxId: string; isOwner: boolean }>();
const emit = defineEmits<{ count: [n: number] }>();

const api = useApi();
const toast = useToast();
const { confirm } = useConfirm();

const members = ref<InboxMember[]>([]);
const loading = ref(false);
const loadError = ref(false);

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    members.value = await api.getInboxMembers(props.inboxId);
    emit("count", members.value.length);
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function changeRole(memberId: string, role: string) {
  try {
    await api.updateInboxMemberRole(props.inboxId, memberId, role);
    toast.success("Role updated");
  } catch {
    toast.error("Couldn't change the role.");
  }
  await load(); // also resets the select to the server's value on failure
}

async function remove(member: InboxMember) {
  const ok = await confirm({
    title: "Remove this member?",
    message: `${member.name || member.email} will lose access to this inbox.`,
    confirmLabel: "Remove",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.removeInboxMember(props.inboxId, member.id);
    await load();
    toast.success("Member removed");
  } catch {
    toast.error("Couldn't remove the member.");
  }
}

// ── Invite (user search combobox) ──
type UserHit = { id: string; email: string; name: string | null };
const showInvite = ref(false);
const role = ref("viewer");
const inviting = ref(false);
const inviteError = ref("");
const query = ref("");
const results = ref<UserHit[]>([]);
const selected = ref<UserHit | null>(null);
const searching = ref(false);
const searchError = ref("");
const active = ref(0);
const listVisible = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
const listOpen = computed(() => listVisible.value && query.value.length >= 2);

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  selected.value = null;
  searchError.value = "";
  active.value = 0;
  if (query.value.length < 2) {
    results.value = [];
    return;
  }
  searching.value = true;
  searchTimer = setTimeout(async () => {
    try {
      results.value = await api.searchUsers(query.value);
    } catch (e: any) {
      results.value = [];
      searchError.value = e?.data?.error || "Couldn't search users. Try again.";
    } finally {
      searching.value = false;
    }
  }, 300);
}

function pick(u: UserHit) {
  selected.value = u;
  listVisible.value = false;
  query.value = "";
  results.value = [];
}

function clearPick() {
  selected.value = null;
  query.value = "";
  results.value = [];
  searchError.value = "";
}

function onComboKeydown(e: KeyboardEvent) {
  if (!listOpen.value) return;
  const n = results.value.length;
  if (e.key === "ArrowDown" && n) {
    e.preventDefault();
    active.value = (active.value + 1) % n;
  } else if (e.key === "ArrowUp" && n) {
    e.preventDefault();
    active.value = (active.value - 1 + n) % n;
  } else if (e.key === "Enter" && n) {
    e.preventDefault();
    pick(results.value[active.value]);
  } else if (e.key === "Escape") {
    e.stopPropagation(); // close the list, not the dialog
    listVisible.value = false;
  }
}

function closeInvite() {
  showInvite.value = false;
  clearPick();
  role.value = "viewer";
  inviteError.value = "";
}

async function invite() {
  if (!selected.value) return;
  inviteError.value = "";
  inviting.value = true;
  try {
    await api.addInboxMember(props.inboxId, selected.value.email, role.value);
    const who = selected.value.name || selected.value.email;
    closeInvite();
    await load();
    toast.success(
      `${who} now has ${role.value === "editor" ? "editor" : "viewer"} access`,
    );
  } catch (e: any) {
    inviteError.value = e?.data?.error || "Couldn't add that member.";
  } finally {
    inviting.value = false;
  }
}

const roleTone = {
  owner: "purple",
  editor: "info",
  viewer: "neutral",
} as const;

load();
</script>

<template>
  <div class="p-6">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Inbox Members
      </h2>
      <UBtn v-if="isOwner" size="sm" @click="showInvite = true"
        >Add Member</UBtn
      >
    </div>

    <p
      v-if="loading"
      role="status"
      class="text-sm text-gray-600 dark:text-gray-400"
    >
      Loading members…
    </p>
    <InlineError v-else-if="loadError" retryable @retry="load"
      >Couldn't load members.</InlineError
    >
    <EmptyState
      v-else-if="!members.length"
      icon="lucide:users"
      title="No members yet"
      compact
    >
      Add someone to share this inbox.
    </EmptyState>
    <ul v-else class="space-y-2">
      <li
        v-for="member in members"
        :key="member.id"
        class="flex flex-wrap items-center gap-3 bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
      >
        <div
          class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-sm font-semibold shrink-0"
          aria-hidden="true"
        >
          {{ (member.name || member.email).charAt(0).toUpperCase() }}
        </div>
        <div class="flex-1 min-w-0">
          <p
            class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate"
          >
            {{ member.name || member.email }}
          </p>
          <p class="text-xs text-gray-600 dark:text-gray-400 truncate">
            {{ member.email }}
          </p>
        </div>
        <Badge
          :tone="roleTone[member.role as keyof typeof roleTone] ?? 'neutral'"
          >{{ member.role }}</Badge
        >
        <template
          v-if="isOwner && member.role !== 'owner' && member.id !== 'owner'"
        >
          <select
            :value="member.role"
            :aria-label="`Role for ${member.name || member.email}`"
            class="field w-auto py-1 text-xs"
            @change="
              changeRole(member.id, ($event.target as HTMLSelectElement).value)
            "
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <UBtn
            variant="danger"
            size="xs"
            :aria-label="`Remove ${member.name || member.email}`"
            @click="remove(member)"
          >
            Remove
          </UBtn>
        </template>
      </li>
    </ul>

    <Modal v-if="showInvite" title="Add Member" @close="closeInvite">
      <form id="invite-form" class="space-y-3" @submit.prevent="invite">
        <div>
          <label
            for="invite-user-search"
            class="block text-sm text-gray-700 dark:text-gray-300 mb-1"
            >Search user</label
          >
          <div
            v-if="selected"
            class="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg"
          >
            <div
              class="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-200 shrink-0"
              aria-hidden="true"
            >
              {{ (selected.name || selected.email)[0].toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <p
                class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate"
              >
                {{ selected.name || selected.email }}
              </p>
              <p
                v-if="selected.name"
                class="text-xs text-gray-600 dark:text-gray-400 truncate"
              >
                {{ selected.email }}
              </p>
            </div>
            <button
              type="button"
              aria-label="Clear selected user"
              class="icon-btn"
              @click="clearPick"
            >
              <Icon name="lucide:x" class="w-4 h-4" />
            </button>
          </div>
          <div v-else class="relative">
            <input
              id="invite-user-search"
              v-model="query"
              type="text"
              role="combobox"
              autocomplete="off"
              aria-autocomplete="list"
              aria-controls="invite-user-results"
              :aria-expanded="listOpen"
              :aria-activedescendant="
                listOpen && results[active]
                  ? `invite-user-${results[active].id}`
                  : undefined
              "
              placeholder="Name or email"
              class="field"
              @input="onSearchInput"
              @focus="listVisible = true"
              @keydown="onComboKeydown"
            />
            <ul
              v-if="listOpen"
              id="invite-user-results"
              role="listbox"
              aria-label="Matching users"
              class="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10"
            >
              <li
                v-if="searching"
                role="presentation"
                class="px-3 py-2 text-xs text-gray-600 dark:text-gray-400"
              >
                Searching…
              </li>
              <li
                v-else-if="searchError"
                role="presentation"
                class="px-3 py-2 text-xs text-red-700 dark:text-red-400"
              >
                {{ searchError }}
              </li>
              <li
                v-else-if="!results.length"
                role="presentation"
                class="px-3 py-2 text-xs text-gray-600 dark:text-gray-400"
              >
                No users found
              </li>
              <li
                v-for="(u, i) in results"
                :id="`invite-user-${u.id}`"
                :key="u.id"
                role="option"
                :aria-selected="i === active"
                class="px-3 py-2 cursor-pointer flex items-center gap-2"
                :class="
                  i === active
                    ? 'bg-indigo-50 dark:bg-gray-700'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                "
                @mousedown.prevent="pick(u)"
              >
                <div
                  class="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-300 shrink-0"
                  aria-hidden="true"
                >
                  {{ (u.name || u.email)[0].toUpperCase() }}
                </div>
                <div class="min-w-0">
                  <p class="text-sm text-gray-800 dark:text-gray-200 truncate">
                    {{ u.name || u.email }}
                  </p>
                  <p
                    v-if="u.name"
                    class="text-xs text-gray-600 dark:text-gray-400 truncate"
                  >
                    {{ u.email }}
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>
        <div>
          <label
            for="invite-role"
            class="block text-sm text-gray-700 dark:text-gray-300 mb-1"
            >Role</label
          >
          <select id="invite-role" v-model="role" class="field">
            <option value="viewer">Viewer — can read messages</option>
            <option value="editor">Editor — can also send and manage</option>
          </select>
        </div>
        <p class="text-xs text-gray-600 dark:text-gray-400">
          They get access right away and will see this inbox in their sidebar.
        </p>
        <InlineError v-if="inviteError">{{ inviteError }}</InlineError>
      </form>
      <template #footer>
        <UBtn type="button" variant="ghost" @click="closeInvite">Cancel</UBtn>
        <UBtn
          type="submit"
          form="invite-form"
          :disabled="!selected"
          :loading="inviting"
        >
          {{ inviting ? "Adding…" : "Add member" }}
        </UBtn>
      </template>
    </Modal>
  </div>
</template>
