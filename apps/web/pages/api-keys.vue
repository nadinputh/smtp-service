<template>
  <UpcomingPage
    title="API Keys"
    description="Manage programmatic access keys for CI/CD and integrations"
    icon="lucide:key"
    :features="features"
  />
</template>

<script setup lang="ts">
definePageMeta({ layout: "default" });
useHead({ title: "API Keys" });

const features = [
  {
    icon: "lucide:shield",
    label: "Scoped permissions",
    description:
      "Create keys limited to exactly what they need — send, read, or delete.",
  },
  {
    icon: "lucide:calendar-clock",
    label: "Expiring keys",
    description:
      "Set an optional expiration date so unused keys don't linger forever.",
  },
  {
    icon: "lucide:activity",
    label: "Usage tracking",
    description:
      "See when each key was created and last used, so you can spot stale credentials.",
  },
];
</script>
