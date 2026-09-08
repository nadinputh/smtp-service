<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center"
    >
      <div class="flex items-center justify-between w-full">
        <div>
          <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Domains
          </h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Manage sending domains &amp; DKIM keys
          </p>
        </div>
        <UBtn size="sm" @click="showAddModal = true">
          <Icon name="lucide:plus" class="w-4 h-4" /> Add Domain
        </UBtn>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div v-if="pending" class="text-gray-500 dark:text-gray-400">Loading...</div>
      <div
        v-else-if="!domainList?.length"
        class="text-center text-gray-500 dark:text-gray-400 py-12"
      >
        <Icon name="lucide:globe" class="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No domains configured yet</p>
        <p class="text-xs mt-1">
          Add a domain to enable DKIM signing for outbound emails
        </p>
      </div>
      <div v-else class="space-y-4">
        <div
          v-for="d in domainList"
          :key="d.id"
          class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
        >
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <Icon name="lucide:globe" class="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <span class="font-medium text-gray-800 dark:text-gray-100">{{
                d.domain
              }}</span>
              <span
                v-if="d.verified"
                class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                >Verified</span
              >
              <span
                v-else
                class="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                >Unverified</span
              >
            </div>
            <div class="flex items-center gap-2">
              <UBtn
                variant="secondary"
                size="xs"
                @click="handleVerify(d.id)"
                :disabled="verifying === d.id"
              >
                {{ verifying === d.id ? "Checking..." : "Verify DNS" }}
              </UBtn>
              <UBtn
                variant="danger"
                size="xs"
                aria-label="Delete domain"
                @click="handleDeleteDomain(d.id)"
              >
                <Icon name="lucide:trash-2" class="w-3.5 h-3.5" />
              </UBtn>
            </div>
          </div>
          <!-- DNS Records -->
          <div
            class="bg-gray-50 dark:bg-gray-900 rounded-md p-3 text-xs space-y-2"
          >
            <p
              class="font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
            >
              DNS Records
            </p>
            <div>
              <span class="text-gray-500 dark:text-gray-400">DKIM TXT:</span>
              <div class="flex items-start gap-2 mt-0.5">
                <code
                  class="flex-1 text-gray-700 dark:text-gray-300 break-all bg-white dark:bg-gray-800 rounded px-2 py-1 border border-gray-200 dark:border-gray-700"
                >
                  {{ d.dkimSelector }}._domainkey.{{ d.domain }} → v=DKIM1;
                  k=rsa; p={{ d.dkimPublicKey?.substring(0, 40) }}...
                </code>
                <button
                  type="button"
                  class="shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                  :aria-label="
                    copiedField === `${d.id}:record`
                      ? 'DKIM record copied'
                      : 'Copy DKIM record'
                  "
                  @click="copyToClipboard(dkimRecordValue(d), `${d.id}:record`)"
                >
                  <Icon
                    :name="
                      copiedField === `${d.id}:record`
                        ? 'lucide:check'
                        : 'lucide:copy'
                    "
                    class="w-3.5 h-3.5"
                  />
                </button>
              </div>
            </div>
            <button
              type="button"
              :aria-expanded="expandedDkim === d.id"
              class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
              @click="
                expandedDkim === d.id
                  ? (expandedDkim = '')
                  : (expandedDkim = d.id)
              "
            >
              {{ expandedDkim === d.id ? "Hide full key" : "Show full key" }}
            </button>
            <div
              v-if="expandedDkim === d.id"
              class="flex items-start gap-2"
            >
              <code
                class="flex-1 text-gray-700 dark:text-gray-300 break-all bg-white dark:bg-gray-800 rounded px-2 py-1 border border-gray-200 dark:border-gray-700"
              >
                v=DKIM1; k=rsa; p={{ d.dkimPublicKey }}
              </code>
              <button
                type="button"
                class="shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                :aria-label="
                  copiedField === `${d.id}:pubkey`
                    ? 'Public key copied'
                    : 'Copy public key'
                "
                @click="copyToClipboard(d.dkimPublicKey || '', `${d.id}:pubkey`)"
              >
                <Icon
                  :name="
                    copiedField === `${d.id}:pubkey`
                      ? 'lucide:check'
                      : 'lucide:copy'
                  "
                  class="w-3.5 h-3.5"
                />
              </button>
            </div>
            <p
              v-if="copyError"
              role="alert"
              class="text-xs text-red-600 dark:text-red-400"
            >
              {{ copyError }}
            </p>
          </div>
          <div
            v-if="verifyResult[d.id]"
            role="status"
            aria-live="polite"
            class="mt-2"
          >
            <p
              class="text-xs"
              :class="
                verifyResult[d.id].verified
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              "
            >
              {{
                verifyResult[d.id].verified
                  ? "DNS records verified!"
                  : verifyResult[d.id].errors?.join(", ") ||
                    "Verification failed"
              }}
            </p>
          </div>
        </div>
      </div>

      <p
        v-if="deleteError"
        role="alert"
        class="text-sm text-red-600 dark:text-red-400 mt-4"
      >
        {{ deleteError }}
      </p>
    </div>

    <!-- Add Domain Modal -->
    <Teleport to="body">
      <div
        v-if="showAddModal"
        class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
        @click.self="showAddModal = false"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-6"
        >
          <h2
            class="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4"
          >
            Add Domain
          </h2>
          <form @submit.prevent="handleAddDomain">
            <label
              for="domain-name"
              class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >Domain</label
            >
            <input
              id="domain-name"
              v-model="newDomain"
              type="text"
              required
              placeholder="example.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p
              v-if="addError"
              role="alert"
              class="text-sm text-red-600 dark:text-red-400 mt-2"
            >
              {{ addError }}
            </p>
            <div class="flex justify-end gap-2 mt-4">
              <UBtn type="button" variant="ghost" @click="showAddModal = false">
                Cancel
              </UBtn>
              <UBtn type="submit" :disabled="adding">
                {{ adding ? "Adding..." : "Add Domain" }}
              </UBtn>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: "default" });
useHead({ title: "Domains" });

const api = useApi();

const {
  data: domainList,
  pending,
  refresh,
} = useAsyncData("domains", () => api.getDomains());

const showAddModal = ref(false);
const newDomain = ref("");
const adding = ref(false);
const addError = ref("");
const deleteError = ref("");
const verifying = ref("");
const expandedDkim = ref("");
const verifyResult = ref<
  Record<string, { verified: boolean; errors?: string[] }>
>({});

const copiedField = ref("");
const copyError = ref("");
let copyTimeout: ReturnType<typeof setTimeout> | undefined;

function dkimRecordValue(d: { dkimPublicKey?: string }) {
  return `v=DKIM1; k=rsa; p=${d.dkimPublicKey ?? ""}`;
}

async function copyToClipboard(text: string, fieldKey: string) {
  copyError.value = "";
  try {
    await navigator.clipboard.writeText(text);
    copiedField.value = fieldKey;
    clearTimeout(copyTimeout);
    copyTimeout = setTimeout(() => {
      copiedField.value = "";
    }, 2000);
  } catch {
    copyError.value = "Could not copy to clipboard";
  }
}

onUnmounted(() => {
  clearTimeout(copyTimeout);
});

async function handleAddDomain() {
  addError.value = "";
  adding.value = true;
  try {
    await api.createDomain(newDomain.value);
    showAddModal.value = false;
    newDomain.value = "";
    await refresh();
  } catch (e: any) {
    addError.value = e?.data?.error || "Failed to add domain";
  } finally {
    adding.value = false;
  }
}

async function handleVerify(domainId: string) {
  verifying.value = domainId;
  try {
    const res = await api.verifyDomain(domainId);
    verifyResult.value[domainId] = res;
    if (res.verified) await refresh();
  } catch (e: any) {
    verifyResult.value[domainId] = {
      verified: false,
      errors: [e?.data?.error || "Verification failed"],
    };
  } finally {
    verifying.value = "";
  }
}

async function handleDeleteDomain(domainId: string) {
  if (!confirm("Delete this domain?")) return;
  deleteError.value = "";
  try {
    await api.deleteDomain(domainId);
    await refresh();
  } catch {
    deleteError.value = "Failed to delete domain";
  }
}
</script>
