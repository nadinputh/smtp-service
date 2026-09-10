<template>
  <ul class="mt-1.5 space-y-0.5" role="status" aria-live="polite">
    <li
      v-for="rule in rules"
      :key="rule.label"
      class="flex items-center gap-1.5 text-xs"
      :class="
        rule.met
          ? 'text-green-600 dark:text-green-400'
          : 'text-gray-500 dark:text-gray-400'
      "
    >
      <Icon
        :name="rule.met ? 'lucide:check-circle-2' : 'lucide:circle'"
        class="w-3.5 h-3.5 shrink-0"
      />
      {{ rule.label }}
    </li>
  </ul>
</template>

<script setup lang="ts">
const props = defineProps<{ password: string }>();

const rules = computed(() => [
  { label: "At least 8 characters", met: props.password.length >= 8 },
  { label: "An uppercase letter", met: /[A-Z]/.test(props.password) },
  { label: "A lowercase letter", met: /[a-z]/.test(props.password) },
  { label: "A number", met: /[0-9]/.test(props.password) },
]);
</script>
