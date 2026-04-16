<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?:
      | "primary"
      | "secondary"
      | "danger"
      | "danger-filled"
      | "ghost"
      | "warning";
    size?: "xs" | "sm" | "md";
  }>(),
  {
    variant: "primary",
    size: "md",
  },
);

const variantClasses: Record<string, string> = {
  primary: "bg-indigo-600 text-white font-medium hover:bg-indigo-700",
  secondary:
    "border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700",
  danger:
    "border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20",
  "danger-filled": "bg-red-600 text-white font-medium hover:bg-red-700",
  ghost:
    "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200",
  warning:
    "border border-orange-200 dark:border-orange-700 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30",
};

const sizeClasses: Record<string, string> = {
  xs: "text-xs px-2.5 py-1 gap-1",
  sm: "text-sm px-3 py-1.5 gap-1.5",
  md: "text-sm px-4 py-2 gap-2",
};

const classes = computed(() => {
  return [
    "inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-50",
    variantClasses[props.variant],
    sizeClasses[props.size],
  ].join(" ");
});
</script>

<template>
  <button :class="classes">
    <slot />
  </button>
</template>
