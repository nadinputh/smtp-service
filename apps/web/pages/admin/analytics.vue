<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-6xl mx-auto px-6 py-8">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">
            Admin Analytics
          </h1>
          <p class="text-sm text-gray-400 dark:text-gray-500">
            System-wide metrics across all users and inboxes
          </p>
        </div>
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

      <div v-if="loading" class="text-center text-gray-400 py-20">
        Loading analytics...
      </div>

      <template v-else>
        <!-- System Entity Cards -->
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <p
              class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
            >
              Total Users
            </p>
            <p class="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">
              {{ overview?.totalUsers ?? 0 }}
            </p>
          </div>
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <p
              class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
            >
              Total Inboxes
            </p>
            <p class="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">
              {{ overview?.totalInboxes ?? 0 }}
            </p>
          </div>
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <p
              class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
            >
              Total Teams
            </p>
            <p class="text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">
              {{ overview?.totalTeams ?? 0 }}
            </p>
          </div>
        </div>

        <!-- Message Stats Cards -->
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
                System Email Volume
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
                <polygon :points="areaPoints" :fill="metricColor + '20'" />
                <polyline
                  :points="linePoints"
                  fill="none"
                  :stroke="metricColor"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
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

          <!-- Period Breakdown -->
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <h3
              class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4"
            >
              Period Breakdown (last {{ overview?.period.days }}d)
            </h3>
            <div class="space-y-4">
              <div v-for="bar in periodBars" :key="bar.label">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs text-gray-500 dark:text-gray-400">{{
                    bar.label
                  }}</span>
                  <span
                    class="text-xs font-medium text-gray-700 dark:text-gray-300"
                    >{{ bar.value }}</span
                  >
                </div>
                <div
                  class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5"
                >
                  <div
                    class="h-2.5 rounded-full transition-all"
                    :class="bar.color"
                    :style="{
                      width: `${periodMax > 0 ? Math.max((bar.value / periodMax) * 100, 1) : 0}%`,
                    }"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Users & Top Inboxes -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Top Users -->
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <h3
              class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4"
            >
              Top Users by Messages
            </h3>
            <div
              v-if="!topUsers.length"
              class="text-sm text-gray-400 dark:text-gray-500 py-4 text-center"
            >
              No data yet
            </div>
            <table v-else class="w-full text-sm">
              <thead class="text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th class="text-left py-2">User</th>
                  <th class="text-right py-2">Inboxes</th>
                  <th class="text-right py-2">Messages</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                <tr
                  v-for="u in topUsers"
                  :key="u.id"
                  class="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <td class="py-2">
                    <span
                      class="font-medium text-gray-800 dark:text-gray-200"
                      >{{ u.name || u.email }}</span
                    >
                    <span
                      v-if="u.name"
                      class="block text-xs text-gray-400 dark:text-gray-500"
                      >{{ u.email }}</span
                    >
                  </td>
                  <td class="py-2 text-right text-gray-500 dark:text-gray-400">
                    {{ u.inboxCount }}
                  </td>
                  <td class="py-2 text-right">
                    <span
                      class="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                    >
                      {{ u.messageCount }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Top Inboxes -->
          <div
            class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
          >
            <h3
              class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4"
            >
              Top Inboxes by Messages
            </h3>
            <div
              v-if="!topInboxes.length"
              class="text-sm text-gray-400 dark:text-gray-500 py-4 text-center"
            >
              No data yet
            </div>
            <table v-else class="w-full text-sm">
              <thead class="text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th class="text-left py-2">Inbox</th>
                  <th class="text-left py-2">Owner</th>
                  <th class="text-right py-2">Messages</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                <tr
                  v-for="inbox in topInboxes"
                  :key="inbox.id"
                  class="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <td class="py-2">
                    <span
                      class="font-medium text-gray-800 dark:text-gray-200"
                      >{{ inbox.name }}</span
                    >
                    <span
                      v-if="inbox.teamName"
                      class="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-medium"
                    >
                      {{ inbox.teamName }}
                    </span>
                  </td>
                  <td class="py-2 text-gray-500 dark:text-gray-400 text-xs">
                    {{ inbox.ownerName || inbox.ownerEmail }}
                  </td>
                  <td class="py-2 text-right">
                    <span
                      class="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                    >
                      {{ inbox.messageCount }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  AdminAnalyticsOverview,
  TimeseriesData,
  AdminTopUser,
  AdminTopInbox,
} from "~/composables/useApi";

definePageMeta({ layout: "default" });
useHead({ title: "Admin Analytics" });

const api = useApi();

const loading = ref(true);
const overview = ref<AdminAnalyticsOverview | null>(null);
const timeseries = ref<TimeseriesData | null>(null);
const topUsers = ref<AdminTopUser[]>([]);
const topInboxes = ref<AdminTopInbox[]>([]);

const selectedPeriod = ref("30d");
const selectedMetric = ref("sent");

const periods = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
];

const metrics = [
  { label: "Sent", value: "sent" },
  { label: "Delivered", value: "delivered" },
  { label: "Bounced", value: "bounced" },
  { label: "Received", value: "received" },
];

const metricColors: Record<string, string> = {
  sent: "#6366f1",
  delivered: "#22c55e",
  bounced: "#ef4444",
  received: "#6366f1",
};

const metricColor = computed(
  () => metricColors[selectedMetric.value] ?? "#6366f1",
);

// ─── Chart ──────────────────────────────────────────────────
const chartWidth = 600;
const chartHeight = 200;

const chartPoints = computed(() => {
  if (!timeseries.value) return [];
  const vals = timeseries.value.values;
  const max = Math.max(...vals, 1);
  const len = vals.length;
  return vals.map((v, i) => ({
    x: len > 1 ? (i / (len - 1)) * chartWidth : chartWidth / 2,
    y: chartHeight - (v / max) * (chartHeight - 10) - 5,
  }));
});

const linePoints = computed(() =>
  chartPoints.value.map((p) => `${p.x},${p.y}`).join(" "),
);

const areaPoints = computed(() => {
  if (!chartPoints.value.length) return "";
  const pts = chartPoints.value;
  return [
    `0,${chartHeight}`,
    ...pts.map((p) => `${p.x},${p.y}`),
    `${chartWidth},${chartHeight}`,
  ].join(" ");
});

// ─── Period bars ──────────────────────────────────────────
const periodBars = computed(() => {
  if (!overview.value) return [];
  const p = overview.value.period;
  return [
    { label: "Sent", value: p.sent, color: "bg-indigo-500" },
    { label: "Delivered", value: p.delivered, color: "bg-green-500" },
    { label: "Bounced", value: p.bounced, color: "bg-red-500" },
    { label: "Received", value: p.received, color: "bg-blue-500" },
  ];
});

const periodMax = computed(() => {
  if (!overview.value) return 0;
  const p = overview.value.period;
  return Math.max(p.sent, p.delivered, p.bounced, p.received, 1);
});

// ─── Fetch ──────────────────────────────────────────────────
async function fetchAll() {
  loading.value = true;
  try {
    const [ov, ts, tu, ti] = await Promise.all([
      api.getAdminAnalyticsOverview(selectedPeriod.value),
      api.getAdminAnalyticsTimeseries(
        selectedMetric.value,
        selectedPeriod.value,
      ),
      api.getAdminAnalyticsTopUsers(10),
      api.getAdminAnalyticsTopInboxes(10),
    ]);
    overview.value = ov;
    timeseries.value = ts;
    topUsers.value = tu.users;
    topInboxes.value = ti.inboxes;
  } catch {
    // empty
  } finally {
    loading.value = false;
  }
}

async function fetchTimeseries() {
  try {
    timeseries.value = await api.getAdminAnalyticsTimeseries(
      selectedMetric.value,
      selectedPeriod.value,
    );
  } catch {
    // empty
  }
}

watch(selectedPeriod, () => fetchAll());
watch(selectedMetric, () => fetchTimeseries());

onMounted(fetchAll);
</script>
