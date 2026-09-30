<script setup lang="ts">
// How a message / delivery / webhook status looks, decided in one place
// (composables/messageStatuses.ts) so a status reads the same everywhere.
const props = defineProps<{ status: string }>();
const meta = computed(() => statusMeta(props.status));
</script>

<template>
  <Badge :tone="meta.tone">{{ meta.label }}</Badge>
</template>
