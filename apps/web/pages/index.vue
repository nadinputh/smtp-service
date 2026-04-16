<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-6xl mx-auto px-6 py-8">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Analytics Dashboard
        </h1>
        <div
          class="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-0.5"
        >
          <button
            v-for="p in periods"
            :key="p.value"
            @click="selectedPeriod = p.value"
            class="px-3 py-1.5 text-sm rounded-md transition-colors"
            :class="
              selectedPeriod === p.value
                ? 'bg-indigo-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            "
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center text-gray-400 py-20">
        Loading analytics...
      </div>

      <template v-else>
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <p
              class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
            >
              Total Messages
            </p>
            <p class="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">
              {{ overview?.totalMessages ?? 0 }}
            </p>
            <p class="text-xs text-gray-400 mt-1">
              {{ overview?.period.total ?? 0 }} in last
              {{ overview?.period.days }}d
            </p>
          </div>
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <p
              class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
            >
              Delivered
            </p>
            <p class="text-3xl font-bold text-green-600 mt-1">
              {{ overview?.totalDelivered ?? 0 }}
            </p>
            <p class="text-xs text-gray-400 mt-1">
              {{ overview?.deliveryRate ?? 0 }}% delivery rate
            </p>
          </div>
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <p
              class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
            >
              Bounced
            </p>
            <p class="text-3xl font-bold text-red-600 mt-1">
              {{ overview?.totalBounced ?? 0 }}
            </p>
            <p class="text-xs text-gray-400 mt-1">
              {{ overview?.bounceRate ?? 0 }}% bounce rate
            </p>
          </div>
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <p
              class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
            >
              Received
            </p>
            <p class="text-3xl font-bold text-indigo-600 mt-1">
              {{ overview?.totalReceived ?? 0 }}
            </p>
            <p class="text-xs text-gray-400 mt-1">
              {{ overview?.period.received ?? 0 }} in period
            </p>
          </div>
        </div>

        <!-- Account Usage / Quotas -->
        <div
          v-if="usage"
          class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-8"
        >
          <h3
            class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4"
          >
            Account Usage
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-gray-500 dark:text-gray-400"
                  >Monthly Sends</span
                >
                <span
                  class="text-xs font-medium text-gray-700 dark:text-gray-300"
                  >{{ usage.currentMonthlySent }} /
                  {{ usage.monthlySendLimit }}</span
                >
              </div>
              <div
                class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5"
              >
                <div
                  class="h-2.5 rounded-full transition-all"
                  :class="
                    sendUsagePct > 90
                      ? 'bg-red-500'
                      : sendUsagePct > 70
                        ? 'bg-yellow-500'
                        : 'bg-indigo-500'
                  "
                  :style="{ width: `${Math.min(sendUsagePct, 100)}%` }"
                />
              </div>
              <p class="text-[10px] text-gray-400 mt-1">
                Resets {{ formatResetDate(usage.quotaResetAt) }}
              </p>
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-gray-500 dark:text-gray-400"
                  >Inboxes</span
                >
                <span
                  class="text-xs font-medium text-gray-700 dark:text-gray-300"
                  >{{ usage.currentInboxes }} / {{ usage.maxInboxes }}</span
                >
              </div>
              <div
                class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5"
              >
                <div
                  class="h-2.5 rounded-full transition-all"
                  :class="
                    inboxUsagePct > 90
                      ? 'bg-red-500'
                      : inboxUsagePct > 70
                        ? 'bg-yellow-500'
                        : 'bg-indigo-500'
                  "
                  :style="{ width: `${Math.min(inboxUsagePct, 100)}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Charts Row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <!-- Email Volume Chart -->
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <div class="flex items-center justify-between mb-4">
              <h3
                class="text-sm font-semibold text-gray-700 dark:text-gray-300"
              >
                Email Volume
              </h3>
              <div
                class="flex items-center gap-1 bg-gray-50 dark:bg-gray-900 rounded-lg p-0.5"
              >
                <button
                  v-for="m in metrics"
                  :key="m.value"
                  @click="selectedMetric = m.value"
                  class="px-2 py-1 text-xs rounded transition-colors"
                  :class="
                    selectedMetric === m.value
                      ? 'bg-white dark:bg-gray-700 shadow text-gray-800 dark:text-gray-100'
                      : 'text-gray-500 dark:text-gray-400'
                  "
                >
                  {{ m.label }}
                </button>
              </div>
            </div>
            <div class="h-64">
              <svg
                v-if="timeseries"
                :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
                class="w-full h-full"
                preserveAspectRatio="none"
              >
                <!-- Grid lines -->
                <line
                  v-for="i in 5"
                  :key="'grid-' + i"
                  :x1="0"
                  :y1="(chartHeight / 5) * i"
                  :x2="chartWidth"
                  :y2="(chartHeight / 5) * i"
                  stroke="#f3f4f6"
                  stroke-width="1"
                />
                <!-- Area fill -->
                <polygon :points="areaPoints" :fill="metricColor + '20'" />
                <!-- Line -->
                <polyline
                  :points="linePoints"
                  fill="none"
                  :stroke="metricColor"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
                <!-- Dots -->
                <circle
                  v-for="(pt, idx) in chartPoints"
                  :key="idx"
                  :cx="pt.x"
                  :cy="pt.y"
                  r="3"
                  :fill="metricColor"
                  class="opacity-0 hover:opacity-100 transition-opacity"
                />
              </svg>
              <div
                v-else
                class="h-full flex items-center justify-center text-sm text-gray-400"
              >
                No data
              </div>
            </div>
            <!-- X-axis labels -->
            <div
              v-if="timeseries"
              class="flex justify-between mt-1 text-[10px] text-gray-400"
            >
              <span>{{ timeseries.labels[0] }}</span>
              <span v-if="timeseries.labels.length > 2">{{
                timeseries.labels[Math.floor(timeseries.labels.length / 2)]
              }}</span>
              <span>{{ timeseries.labels[timeseries.labels.length - 1] }}</span>
            </div>
          </div>

          <!-- Bounce Rate Chart -->
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <h3
              class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4"
            >
              Bounce Rate (%)
            </h3>
            <div class="h-64">
              <svg
                v-if="bounceData"
                :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
                class="w-full h-full"
                preserveAspectRatio="none"
              >
                <line
                  v-for="i in 5"
                  :key="'bgrid-' + i"
                  :x1="0"
                  :y1="(chartHeight / 5) * i"
                  :x2="chartWidth"
                  :y2="(chartHeight / 5) * i"
                  stroke="#f3f4f6"
                  stroke-width="1"
                />
                <!-- Bars -->
                <rect
                  v-for="(val, idx) in bounceData.values"
                  :key="idx"
                  :x="idx * (chartWidth / bounceData.values.length) + 2"
                  :y="
                    chartHeight - (val / Math.max(bounceMax, 1)) * chartHeight
                  "
                  :width="
                    Math.max(chartWidth / bounceData.values.length - 4, 1)
                  "
                  :height="(val / Math.max(bounceMax, 1)) * chartHeight"
                  fill="#ef4444"
                  rx="1"
                  class="opacity-70 hover:opacity-100 transition-opacity"
                />
              </svg>
              <div
                v-else
                class="h-full flex items-center justify-center text-sm text-gray-400"
              >
                No data
              </div>
            </div>
            <div
              v-if="bounceData"
              class="flex justify-between mt-1 text-[10px] text-gray-400"
            >
              <span>{{ bounceData.labels[0] }}</span>
              <span>{{ bounceData.labels[bounceData.labels.length - 1] }}</span>
            </div>
          </div>
        </div>

        <!-- Top Recipients -->
        <div
          class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
        >
          <h3
            class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4"
          >
            Top Recipient Domains
          </h3>
          <div
            v-if="!topRecipients?.domains.length"
            class="text-sm text-gray-400"
          >
            No delivery data yet
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="(d, idx) in topRecipients.domains"
              :key="d.domain"
              class="flex items-center gap-3"
            >
              <span class="text-xs text-gray-400 w-5 text-right">{{
                idx + 1
              }}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-0.5">
                  <span
                    class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate"
                    >{{ d.domain }}</span
                  >
                  <span class="text-xs text-gray-500 shrink-0 ml-2">{{
                    d.count
                  }}</span>
                </div>
                <div
                  class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5"
                >
                  <div
                    class="bg-indigo-500 h-1.5 rounded-full transition-all"
                    :style="{
                      width: `${topRecipients.domains.length ? (d.count / topRecipients.domains[0].count) * 100 : 0}%`,
                    }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  AnalyticsOverview,
  TimeseriesData,
  AccountUsage,
} from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "Dashboard" });

const api = useApi();

const periods = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
];

const metrics = [
  { label: "Sent", value: "sent" },
  { label: "Delivered", value: "delivered" },
  { label: "Bounced", value: "bounced" },
  { label: "Received", value: "received" },
];

const selectedPeriod = ref("30d");
const selectedMetric = ref("sent");

const overview = ref<AnalyticsOverview | null>(null);
const timeseries = ref<TimeseriesData | null>(null);
const bounceData = ref<TimeseriesData | null>(null);
const topRecipients = ref<{
  domains: { domain: string; count: number }[];
} | null>(null);
const usage = ref<AccountUsage | null>(null);
const loading = ref(true);

const chartWidth = 600;
const chartHeight = 200;

const maxValue = computed(() =>
  timeseries.value ? Math.max(...timeseries.value.values, 1) : 1,
);

const bounceMax = computed(() =>
  bounceData.value ? Math.max(...bounceData.value.values, 1) : 1,
);

const sendUsagePct = computed(() =>
  usage.value
    ? (usage.value.currentMonthlySent / usage.value.monthlySendLimit) * 100
    : 0,
);

const inboxUsagePct = computed(() =>
  usage.value ? (usage.value.currentInboxes / usage.value.maxInboxes) * 100 : 0,
);

function formatResetDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const metricColor = computed(() => {
  switch (selectedMetric.value) {
    case "delivered":
      return "#16a34a";
    case "bounced":
      return "#ef4444";
    case "received":
      return "#6366f1";
    default:
      return "#3b82f6";
  }
});

const chartPoints = computed(() => {
  if (!timeseries.value) return [];
  const { values } = timeseries.value;
  const max = maxValue.value;
  return values.map((v, i) => ({
    x:
      values.length > 1
        ? (i / (values.length - 1)) * chartWidth
        : chartWidth / 2,
    y: chartHeight - (v / max) * (chartHeight - 10) - 5,
  }));
});

const linePoints = computed(() =>
  chartPoints.value.map((p) => `${p.x},${p.y}`).join(" "),
);

const areaPoints = computed(() => {
  if (!chartPoints.value.length) return "";
  const pts = chartPoints.value;
  return `0,${chartHeight} ${pts.map((p) => `${p.x},${p.y}`).join(" ")} ${chartWidth},${chartHeight}`;
});

async function loadData() {
  loading.value = true;
  try {
    const [ov, ts, br, tr, us] = await Promise.all([
      api.getAnalyticsOverview(selectedPeriod.value),
      api.getAnalyticsTimeseries(selectedMetric.value, selectedPeriod.value),
      api.getAnalyticsBounceRate(selectedPeriod.value),
      api.getAnalyticsTopRecipients(),
      api.getAccountUsage(),
    ]);
    overview.value = ov;
    timeseries.value = ts;
    bounceData.value = br;
    topRecipients.value = tr;
    usage.value = us;
  } catch (e) {
    console.error("Failed to load analytics", e);
  } finally {
    loading.value = false;
  }
}

watch(selectedPeriod, () => loadData());
watch(selectedMetric, async () => {
  try {
    timeseries.value = await api.getAnalyticsTimeseries(
      selectedMetric.value,
      selectedPeriod.value,
    );
  } catch (e) {
    console.error("Failed to load timeseries", e);
  }
});

onMounted(() => loadData());
</script>
