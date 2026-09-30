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
    /** Render as a link instead of a button. */
    to?: string | Record<string, unknown>;
    /** Leading icon name (lucide:…). */
    icon?: string;
    /** Busy: disables the button and shows a spinner. */
    loading?: boolean;
    disabled?: boolean;
  }>(),
  {
    variant: "primary",
    size: "md",
    loading: false,
    disabled: false,
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
  // Visible padding stays as-is everywhere it's already shipped; the
  // pseudo-element below pads the tap target up toward 44px (WCAG 2.5.5)
  // without changing layout. Vertical-only: these buttons are almost always
  // in tight horizontal clusters (e.g. "Edit  Delete"), so widening the hit
  // area sideways would make adjacent buttons overlap and misfire.
  xs: "text-xs px-2.5 py-2 gap-1 before:absolute before:inset-x-0 before:-top-1.5 before:-bottom-1.5 before:content-['']",
  sm: "text-sm px-3 py-2.5 gap-1.5 before:absolute before:inset-x-0 before:-top-0.5 before:-bottom-0.5 before:content-['']",
  md: "text-sm px-4 py-3 gap-2",
};

const classes = computed(() => {
  return [
    "relative inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800",
    variantClasses[props.variant],
    sizeClasses[props.size],
  ].join(" ");
});
</script>

<template>
  <NuxtLink v-if="to" :to="to" :class="classes">
    <Icon v-if="icon" :name="icon" class="w-4 h-4" />
    <slot />
  </NuxtLink>
  <button
    v-else
    :class="classes"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <Icon
      v-if="loading"
      name="lucide:loader-2"
      class="w-4 h-4 animate-spin motion-reduce:animate-none"
    />
    <Icon v-else-if="icon" :name="icon" class="w-4 h-4" />
    <slot />
  </button>
</template>
