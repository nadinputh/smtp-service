<script setup lang="ts">
// A tabpanel that is always in the DOM (so the tab's aria-controls resolves)
// but only renders its content, and only shows, while its tab is active.
defineProps<{ idPrefix: string; tab: string; active: string }>();
</script>

<template>
  <div
    v-show="active === tab"
    :id="`${idPrefix}-panel-${tab}`"
    role="tabpanel"
    :aria-labelledby="`${idPrefix}-tab-${tab}`"
    tabindex="0"
    class="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
  >
    <slot v-if="active === tab" />
  </div>
</template>
