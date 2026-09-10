<template>
  <div class="h-full flex flex-col">
    <header
      class="px-6 h-20 shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center"
    >
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
            {{ title }}
          </h2>
          <span
            class="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400 font-medium"
          >
            Upcoming
          </span>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ description }}
        </p>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      <div class="max-w-lg mx-auto text-center py-8">
        <div
          class="w-14 h-14 mx-auto mb-4 rounded-full bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center"
        >
          <Icon :name="icon" class="w-7 h-7 text-violet-600 dark:text-violet-400" />
        </div>
        <h3 class="text-base font-semibold text-gray-800 dark:text-gray-100">
          {{ title }} is coming soon
        </h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
          {{ description }}. We're putting the finishing touches on it — here's
          what to expect:
        </p>

        <ul class="mt-6 space-y-3 text-left">
          <li
            v-for="feature in features"
            :key="feature.label"
            class="flex items-start gap-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
          >
            <div
              class="shrink-0 w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-700 flex items-center justify-center"
            >
              <Icon
                :name="feature.icon"
                class="w-4 h-4 text-gray-500 dark:text-gray-400"
              />
            </div>
            <div class="min-w-0">
              <p
                class="text-sm font-medium text-gray-800 dark:text-gray-100"
              >
                {{ feature.label }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {{ feature.description }}
              </p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
  icon: string;
  features: { icon: string; label: string; description: string }[];
}>();
</script>
