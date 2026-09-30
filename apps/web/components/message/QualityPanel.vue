<script setup lang="ts">
type SpamRule = { rule: string; score: number; description: string };

const props = defineProps<{
  messageId: string;
  spamScore: number | null;
  spamRules: SpamRule[] | null;
}>();
const api = useApi();

const verdict = computed(() => spamVerdict(props.spamScore));

const SUGGESTIONS: Record<string, string> = {
  SUBJ_ALL_CAPS: "Avoid using ALL CAPS in the subject line.",
  MISSING_SUBJECT: "Always include a meaningful subject line.",
  SUBJ_SPAM_WORDS: "Remove spammy trigger words from the subject.",
  SUBJ_EXCESSIVE_PUNCTUATION: "Reduce excessive punctuation in the subject.",
  BODY_PHARMA_SPAM: "Remove pharmaceutical / health-scam keywords.",
  BODY_ADVANCE_FEE: "Avoid advance-fee / scam phrasing in the body.",
  BODY_MONEY_OFFERS: "Remove money-related solicitation language.",
  EXCESSIVE_LINKS: "Reduce the number of links (< 20 recommended).",
  HTML_MANY_LINKS: "Keep HTML link count below 10.",
  HTML_ONLY: "Include a plain-text alternative alongside HTML.",
  IMAGE_ONLY: "Add text content in addition to images.",
  SHORT_BODY: "Provide more meaningful body content.",
  MISSING_MESSAGE_ID: "Include a valid Message-ID header.",
  MISSING_DATE: "Include a Date header.",
  MISSING_MIME_VERSION: "Include a MIME-Version header.",
  NO_AUTH_RESULTS: "Set up email authentication (SPF, DKIM, DMARC).",
  NO_DKIM: "Sign your emails with DKIM.",
  NO_SPF: "Publish an SPF record for your sending domain.",
  FORGED_SENDER: "Ensure the envelope sender matches the From header domain.",
  SUSPICIOUS_MAILER: "Use a reputable email sending library / service.",
  NO_RECEIVED_HEADERS: "Received headers are expected — check your mail flow.",
  FROM_NO_REPLY: "Avoid using no-reply addresses; use a monitored sender.",
  MISSING_UNSUBSCRIBE: "Include a List-Unsubscribe header for bulk mail.",
  SINGLE_PART_BASE64:
    "Prefer quoted-printable or 7bit for single-part messages.",
};
const suggestions = computed(
  () =>
    (props.spamRules ?? [])
      .map((r) => SUGGESTIONS[r.rule])
      .filter(Boolean) as string[],
);

const ruleText = (score: number) =>
  score < 2
    ? "text-yellow-800 dark:text-yellow-300"
    : score < 3
      ? "text-orange-700 dark:text-orange-300"
      : "text-red-700 dark:text-red-300";

// ── Compatibility ──
const compat = ref<Awaited<
  ReturnType<typeof api.getMessageCompatibility>
> | null>(null);
const compatLoading = ref(false);
const compatError = ref(false);
async function loadCompat() {
  compatLoading.value = true;
  compatError.value = false;
  try {
    compat.value = await api.getMessageCompatibility(props.messageId);
  } catch {
    compatError.value = true;
  } finally {
    compatLoading.value = false;
  }
}

const categories = computed(() => {
  if (!compat.value) return [];
  return [
    { key: "css", label: "CSS features" },
    { key: "html", label: "HTML features" },
    { key: "other", label: "Other features" },
  ]
    .map((c) => ({
      ...c,
      features: compat.value!.features.filter((f) => f.category === c.key),
    }))
    .filter((c) => c.features.length > 0);
});

const scoreText = (n: number) =>
  n >= 80
    ? "text-green-700 dark:text-green-400"
    : n >= 60
      ? "text-yellow-800 dark:text-yellow-300"
      : "text-red-700 dark:text-red-400";
const scoreBar = (n: number) =>
  n >= 80 ? "bg-green-600" : n >= 60 ? "bg-yellow-500" : "bg-red-600";
const supportClass = (level: string) =>
  level === "full"
    ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
    : level === "partial"
      ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300"
      : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300";

loadCompat();
</script>

<template>
  <div class="space-y-10">
    <!-- Spam -->
    <section aria-labelledby="quality-spam">
      <h2
        id="quality-spam"
        class="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3"
      >
        Spam analysis
      </h2>
      <div class="mb-4 flex items-center gap-3">
        <div class="text-2xl font-bold tabular-nums" :class="verdict.text">
          {{ spamScore ?? 0 }}
        </div>
        <Badge :tone="verdict.tone">{{ verdict.label }}</Badge>
        <span class="text-xs text-gray-600 dark:text-gray-400"
          >out of 10 · higher is worse</span
        >
      </div>
      <p
        v-if="!spamRules?.length"
        class="text-sm text-gray-600 dark:text-gray-400"
      >
        No spam rules triggered — email looks clean.
      </p>
      <ul v-else class="space-y-2">
        <li
          v-for="(rule, idx) in spamRules"
          :key="idx"
          class="bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between gap-4"
        >
          <div class="min-w-0">
            <span
              class="font-mono text-xs font-semibold text-gray-800 dark:text-gray-100"
              >{{ rule.rule }}</span
            >
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ rule.description }}
            </p>
          </div>
          <span
            class="text-sm font-medium shrink-0 tabular-nums"
            :class="ruleText(rule.score)"
            >+{{ rule.score }}</span
          >
        </li>
      </ul>
      <div
        v-if="suggestions.length"
        class="mt-5 border-t border-gray-100 dark:border-gray-700 pt-4"
      >
        <h3
          class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2"
        >
          Suggestions
        </h3>
        <ul class="space-y-1">
          <li
            v-for="(s, idx) in suggestions"
            :key="idx"
            class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
          >
            <Icon
              name="lucide:lightbulb"
              class="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            {{ s }}
          </li>
        </ul>
      </div>
    </section>

    <!-- Compatibility -->
    <section aria-labelledby="quality-compat">
      <h2
        id="quality-compat"
        class="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3"
      >
        Email client compatibility
      </h2>
      <p
        v-if="compatLoading && !compat"
        role="status"
        class="text-sm text-gray-600 dark:text-gray-400"
      >
        Analyzing compatibility…
      </p>
      <InlineError v-else-if="compatError" retryable @retry="loadCompat"
        >Couldn't load compatibility data.</InlineError
      >
      <EmptyState
        v-else-if="compat && compat.summary.totalFeaturesDetected === 0"
        icon="lucide:file-text"
        title="No HTML content to analyze"
        compact
      />
      <template v-else-if="compat">
        <div
          class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <span
            ><strong class="text-gray-900 dark:text-gray-100">{{
              compat.summary.totalFeaturesDetected
            }}</strong>
            features detected</span
          >
          <span
            ><strong class="text-gray-900 dark:text-gray-100">{{
              compat.summary.fullyCompatibleClients
            }}</strong>
            fully compatible clients</span
          >
          <span
            ><strong class="text-gray-900 dark:text-gray-100">{{
              compat.summary.problematicFeatures
            }}</strong>
            problematic features</span
          >
        </div>

        <ul class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
          <li
            v-for="client in compat.overallScores"
            :key="client.id"
            class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-center"
          >
            <div class="flex items-center justify-center gap-1.5 mb-2">
              <Icon
                :name="client.icon"
                class="w-4 h-4 text-gray-600 dark:text-gray-400"
                aria-hidden="true"
              />
              <span
                class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate"
                >{{ client.name }}</span
              >
            </div>
            <div
              class="text-2xl font-bold tabular-nums"
              :class="scoreText(client.score)"
            >
              {{ client.score }}%
            </div>
            <div
              class="mt-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5"
              aria-hidden="true"
            >
              <div
                class="h-1.5 rounded-full"
                :class="scoreBar(client.score)"
                :style="{ width: client.score + '%' }"
              />
            </div>
            <span
              class="text-xs text-gray-600 dark:text-gray-400 mt-1 inline-block"
              >{{ client.category }}</span
            >
          </li>
        </ul>

        <p
          class="mb-3 text-xs text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-x-3 gap-y-1"
        >
          Support:
          <span class="inline-flex items-center gap-1"
            ><span
              class="inline-flex w-5 h-5 items-center justify-center rounded-full"
              :class="supportClass('full')"
              ><Icon name="lucide:check" class="w-3 h-3"
            /></span>
            full</span
          >
          <span class="inline-flex items-center gap-1"
            ><span
              class="inline-flex w-5 h-5 items-center justify-center rounded-full"
              :class="supportClass('partial')"
              ><Icon name="lucide:minus" class="w-3 h-3"
            /></span>
            partial</span
          >
          <span class="inline-flex items-center gap-1"
            ><span
              class="inline-flex w-5 h-5 items-center justify-center rounded-full"
              :class="supportClass('none')"
              ><Icon name="lucide:x" class="w-3 h-3"
            /></span>
            none</span
          >
        </p>

        <div class="space-y-4">
          <details v-for="cat in categories" :key="cat.key" open>
            <summary
              class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-900 dark:hover:text-gray-200 mb-2 py-1"
            >
              {{ cat.label }} ({{ cat.features.length }})
            </summary>
            <div class="relative overflow-x-auto">
              <table class="w-full text-sm">
                <caption class="sr-only">
                  {{
                    cat.label
                  }}
                  support by email client
                </caption>
                <thead>
                  <tr class="border-b border-gray-200 dark:border-gray-700">
                    <th
                      scope="col"
                      class="text-left py-2 px-3 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase w-48"
                    >
                      Feature
                    </th>
                    <th
                      scope="col"
                      class="text-center py-2 px-1 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase w-12"
                    >
                      Uses
                    </th>
                    <th
                      v-for="client in compat.overallScores"
                      :key="client.id"
                      scope="col"
                      class="text-center py-2 px-1 text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap"
                    >
                      {{ client.name }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="feat in cat.features"
                    :key="feat.name"
                    class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <th scope="row" class="py-2 px-3 text-left font-normal">
                      <span
                        class="font-medium text-gray-800 dark:text-gray-100"
                        >{{ feat.name }}</span
                      >
                      <p class="text-xs text-gray-600 dark:text-gray-400">
                        {{ feat.description }}
                      </p>
                    </th>
                    <td
                      class="text-center py-2 px-1 text-gray-700 dark:text-gray-300 font-mono text-xs"
                    >
                      {{ feat.usageCount }}
                    </td>
                    <td
                      v-for="client in compat.overallScores"
                      :key="client.id"
                      class="text-center py-2 px-1"
                    >
                      <span
                        class="inline-flex items-center justify-center w-6 h-6 rounded-full"
                        :class="supportClass(feat.clients[client.id])"
                        :title="feat.clients[client.id]"
                      >
                        <Icon
                          v-if="feat.clients[client.id] === 'full'"
                          name="lucide:check"
                          class="w-3.5 h-3.5"
                        />
                        <Icon
                          v-else-if="feat.clients[client.id] === 'partial'"
                          name="lucide:minus"
                          class="w-3.5 h-3.5"
                        />
                        <Icon v-else name="lucide:x" class="w-3.5 h-3.5" />
                        <span class="sr-only">{{
                          feat.clients[client.id]
                        }}</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </template>
    </section>
  </div>
</template>
