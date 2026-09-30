<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 py-3 min-h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Domains
        </h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Manage sending domains &amp; DKIM keys
        </p>
      </div>
      <UBtn size="sm" class="self-start sm:self-auto" @click="openAddModal">
        <Icon name="lucide:plus" class="w-4 h-4" />
        Add domain
      </UBtn>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="loading" class="text-sm text-gray-500 dark:text-gray-400">
        Loading...
      </div>

      <div v-else-if="loadError" class="text-center py-16">
        <Icon
          name="lucide:alert-circle"
          class="w-10 h-10 mx-auto mb-3 text-red-500"
        />
        <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Couldn't load domains
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Something went wrong fetching your sending domains.
        </p>
        <UBtn size="sm" @click="fetchDomains">Retry</UBtn>
      </div>

      <div
        v-else-if="!domains.length"
        class="text-center py-16 text-gray-500 dark:text-gray-400"
      >
        <Icon name="lucide:globe" class="w-12 h-12 mx-auto mb-3" />
        <p class="text-lg font-medium">No sending domains yet</p>
        <p class="text-sm">
          Add a domain to generate DKIM keys and start sending in production.
        </p>
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
                <th class="px-4 py-3">Domain</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3">Added</th>
                <th class="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <template v-for="d in domains" :key="d.id">
                <tr
                  class="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td
                    class="px-4 py-3 font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap"
                  >
                    <button
                      type="button"
                      class="flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-indigo-400"
                      :aria-expanded="expandedIds.has(d.id)"
                      :aria-controls="`domain-records-${d.id}`"
                      @click="toggleExpanded(d.id)"
                    >
                      <Icon
                        :name="
                          expandedIds.has(d.id)
                            ? 'lucide:chevron-down'
                            : 'lucide:chevron-right'
                        "
                        class="w-4 h-4 shrink-0 text-gray-400"
                      />
                      {{ d.domain }}
                    </button>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap">
                    <span
                      class="text-xs px-2 py-0.5 rounded-full font-medium"
                      :class="statusBadgeClass(d)"
                    >
                      {{ statusLabel(d) }}
                    </span>
                  </td>
                  <td
                    class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap"
                  >
                    {{ formatDate(d.createdAt) }}
                  </td>
                  <td class="px-4 py-3 text-right whitespace-nowrap">
                    <UBtn
                      variant="ghost"
                      size="xs"
                      class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                      :disabled="verifying[d.id]"
                      @click="handleVerify(d)"
                    >
                      {{ verifying[d.id] ? "Checking..." : "Re-check" }}
                    </UBtn>
                    <UBtn
                      variant="danger"
                      size="xs"
                      class="ml-1"
                      @click="confirmDelete(d)"
                    >
                      Delete
                    </UBtn>
                  </td>
                </tr>
                <tr
                  v-if="expandedIds.has(d.id)"
                  :id="`domain-records-${d.id}`"
                  class="bg-gray-50 dark:bg-gray-800/50"
                >
                  <td colspan="4" class="px-4 py-4">
                    <div class="max-w-2xl space-y-4">
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        Publish these two TXT records with your DNS provider,
                        then re-check. DNS changes can take anywhere from a
                        few minutes to 24&ndash;48 hours to propagate.
                      </p>

                      <div
                        v-for="rec in dnsRecordsFor(d)"
                        :key="rec.label"
                        class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                      >
                        <p
                          class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2"
                        >
                          {{ rec.label }}
                        </p>
                        <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                          <span class="text-gray-500 dark:text-gray-400 pt-0.5">
                            Type
                          </span>
                          <code class="text-gray-800 dark:text-gray-200">TXT</code>

                          <span class="text-gray-500 dark:text-gray-400 pt-0.5">
                            Host
                          </span>
                          <div class="flex items-start gap-1.5 min-w-0">
                            <code
                              class="text-gray-800 dark:text-gray-200 break-all"
                              >{{ rec.name }}</code
                            >
                            <button
                              type="button"
                              class="shrink-0 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              :aria-label="
                                copiedField === `${d.id}:${rec.label}:name`
                                  ? `${rec.label} host copied`
                                  : `Copy ${rec.label} host`
                              "
                              @click="copy(rec.name, `${d.id}:${rec.label}:name`)"
                            >
                              <Icon
                                :name="
                                  copiedField === `${d.id}:${rec.label}:name`
                                    ? 'lucide:check'
                                    : 'lucide:copy'
                                "
                                class="w-3.5 h-3.5"
                              />
                            </button>
                          </div>

                          <span class="text-gray-500 dark:text-gray-400 pt-0.5">
                            Value
                          </span>
                          <div class="flex items-start gap-1.5 min-w-0">
                            <code
                              class="text-gray-800 dark:text-gray-200 break-all"
                              >{{ rec.value }}</code
                            >
                            <button
                              type="button"
                              class="shrink-0 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                              :aria-label="
                                copiedField === `${d.id}:${rec.label}:value`
                                  ? `${rec.label} value copied`
                                  : `Copy ${rec.label} value`
                              "
                              @click="copy(rec.value, `${d.id}:${rec.label}:value`)"
                            >
                              <Icon
                                :name="
                                  copiedField === `${d.id}:${rec.label}:value`
                                    ? 'lucide:check'
                                    : 'lucide:copy'
                                "
                                class="w-3.5 h-3.5"
                              />
                            </button>
                          </div>
                        </div>
                        <p
                          v-if="rec.note"
                          class="text-xs text-gray-500 dark:text-gray-400 mt-2"
                        >
                          {{ rec.note }}
                        </p>
                      </div>

                      <div
                        v-if="lastCheck[d.id]"
                        class="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
                        :class="
                          lastCheck[d.id]!.errors.length
                            ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                            : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        "
                        role="status"
                      >
                        <Icon
                          :name="
                            lastCheck[d.id]!.errors.length
                              ? 'lucide:clock'
                              : 'lucide:check-circle-2'
                          "
                          class="w-4 h-4 shrink-0 mt-0.5"
                        />
                        <div>
                          <p v-if="lastCheck[d.id]!.errors.length">
                            Not verified yet as of
                            {{ formatTime(lastCheck[d.id]!.checkedAt) }} —
                            {{ lastCheck[d.id]!.errors[0] }}. If you just
                            published the record, this is expected; try
                            re-checking again shortly.
                          </p>
                          <p v-else>
                            Verified at
                            {{ formatTime(lastCheck[d.id]!.checkedAt) }}.
                          </p>
                        </div>
                      </div>

                      <UBtn
                        size="xs"
                        variant="secondary"
                        :disabled="verifying[d.id]"
                        @click="handleVerify(d)"
                      >
                        <Icon name="lucide:refresh-cw" class="w-3.5 h-3.5" />
                        {{ verifying[d.id] ? "Checking..." : "Re-check verification" }}
                      </UBtn>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Add domain modal -->
    <Modal v-if="showAddModal" title="Add domain" @close="showAddModal = false">
      <form @submit.prevent="handleAdd">
        <label
          for="add-domain-name"
          class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
        >
          Domain <span class="text-red-500 dark:text-red-400">*</span>
        </label>
        <input
          id="add-domain-name"
          v-model="addForm.domain"
          type="text"
          required
          placeholder="mail.example.com"
          class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-3"
        />
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
          We'll generate a DKIM key pair for this domain and show you the DNS
          records to publish.
        </p>
        <p
          v-if="addError"
          role="alert"
          class="text-sm text-red-600 dark:text-red-400 mb-2"
        >
          {{ addError }}
        </p>
        <div class="flex justify-end gap-2 mt-4">
          <UBtn type="button" variant="ghost" @click="showAddModal = false">
            Cancel
          </UBtn>
          <UBtn type="submit" :disabled="adding">
            {{ adding ? "Adding..." : "Add domain" }}
          </UBtn>
        </div>
      </form>
    </Modal>

    <!-- Delete confirmation -->
    <Modal
      v-if="deleteTarget"
      title="Delete domain"
      title-class="mb-2"
      @close="deleteTarget = null"
    >
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Are you sure you want to delete
        <strong>{{ deleteTarget.domain }}</strong
        >? Its DKIM keys will be removed and production mail for this domain
        will stop being signed. This action cannot be undone.
      </p>
      <p
        v-if="deleteError"
        role="alert"
        class="text-sm text-red-600 dark:text-red-400 mb-2"
      >
        {{ deleteError }}
      </p>
      <div class="flex justify-end gap-2">
        <UBtn variant="ghost" @click="deleteTarget = null">Cancel</UBtn>
        <UBtn
          variant="danger-filled"
          :disabled="deleting"
          @click="handleDelete"
        >
          {{ deleting ? "Deleting..." : "Delete" }}
        </UBtn>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import type { Domain } from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "Domains" });

const api = useApi();
const toast = useToast();

const domains = ref<Domain[]>([]);
const loading = ref(true);
const loadError = ref(false);

async function fetchDomains() {
  loading.value = true;
  loadError.value = false;
  try {
    domains.value = await api.getDomains();
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchDomains);

// ─── DNS records (derived, same formula the API uses to build them) ───
function dnsRecordsFor(d: Domain) {
  return [
    {
      label: "DKIM",
      name: `${d.dkimSelector}._domainkey.${d.domain}`,
      value: `v=DKIM1; k=rsa; p=${d.dkimPublicKey}`,
      note: "",
    },
    {
      label: "SPF",
      name: d.domain,
      value: "v=spf1 ip4:<YOUR_SERVER_IP> -all",
      note: "Replace <YOUR_SERVER_IP> with your server's public IP address before publishing.",
    },
  ];
}

// ─── Row expand ─────────────────────────────────────────────
const expandedIds = ref<Set<string>>(new Set());

function toggleExpanded(id: string) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

// ─── Status ─────────────────────────────────────────────────
function statusLabel(d: Domain): string {
  if (d.verified) return "Verified";
  if (lastCheck.value[d.id]?.errors.length) return "Pending";
  return "Unverified";
}

function statusBadgeClass(d: Domain): string {
  if (d.verified)
    return "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400";
  if (lastCheck.value[d.id]?.errors.length)
    return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";
  return "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400";
}

// ─── Copy to clipboard ──────────────────────────────────────
const copiedField = ref<string | null>(null);
let copiedTimeout: ReturnType<typeof setTimeout> | undefined;

function copy(text: string, field: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      copiedField.value = field;
      clearTimeout(copiedTimeout);
      copiedTimeout = setTimeout(() => {
        copiedField.value = null;
      }, 2000);
    })
    .catch(() => {
      toast.error("Couldn't copy to clipboard.");
    });
}

// ─── Verify ─────────────────────────────────────────────────
const verifying = reactive<Record<string, boolean>>({});
const lastCheck = ref<
  Record<string, { errors: string[]; checkedAt: Date }>
>({});

async function handleVerify(d: Domain) {
  verifying[d.id] = true;
  try {
    const result = await api.verifyDomain(d.id);
    lastCheck.value = {
      ...lastCheck.value,
      [d.id]: { errors: result.errors, checkedAt: new Date() },
    };
    if (result.verified) {
      d.verified = true;
      toast.success(`${d.domain} is verified`);
    } else {
      expandedIds.value = new Set(expandedIds.value).add(d.id);
      toast.info(`${d.domain} isn't verified yet`);
    }
  } catch (e: any) {
    toast.error(e?.data?.error || "Failed to check verification");
  } finally {
    verifying[d.id] = false;
  }
}

// ─── Add ────────────────────────────────────────────────────
const showAddModal = ref(false);
const addForm = reactive({ domain: "" });
const addError = ref("");
const adding = ref(false);

function openAddModal() {
  addForm.domain = "";
  addError.value = "";
  showAddModal.value = true;
}

async function handleAdd() {
  adding.value = true;
  addError.value = "";
  try {
    const created = await api.createDomain(addForm.domain.trim().toLowerCase());
    domains.value = [created, ...domains.value];
    expandedIds.value = new Set(expandedIds.value).add(created.id);
    showAddModal.value = false;
    toast.success(`${created.domain} added`);
  } catch (e: any) {
    addError.value = e?.data?.error || "Failed to add domain";
  } finally {
    adding.value = false;
  }
}

// ─── Delete ─────────────────────────────────────────────────
const deleteTarget = ref<Domain | null>(null);
const deleting = ref(false);
const deleteError = ref("");

function confirmDelete(d: Domain) {
  deleteTarget.value = d;
  deleteError.value = "";
}

async function handleDelete() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  deleteError.value = "";
  try {
    await api.deleteDomain(deleteTarget.value.id);
    domains.value = domains.value.filter((x) => x.id !== deleteTarget.value!.id);
    toast.success(`${deleteTarget.value.domain} deleted`);
    deleteTarget.value = null;
  } catch (e: any) {
    deleteError.value = e?.data?.error || "Failed to delete domain";
  } finally {
    deleting.value = false;
  }
}

// ─── Formatting ─────────────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
</script>
