<template>
  <UpcomingPage
    title="Suppressions"
    description="Blocked addresses that won't receive emails"
    icon="lucide:shield-off"
    :features="features"
  />
</template>

<script setup lang="ts">
definePageMeta({ layout: "default" });
useHead({ title: "Suppressions" });

const features = [
  {
    icon: "lucide:ban",
    label: "Automatic suppression",
    description:
      "Hard bounces and spam complaints are suppressed automatically to protect your sender reputation.",
  },
  {
    icon: "lucide:user-x",
    label: "Manual management",
    description:
      "Add or remove individual addresses from the suppression list at any time.",
  },
  {
    icon: "lucide:search",
    label: "Search & filter",
    description:
      "Quickly find a suppressed address and see why and when it was blocked.",
  },
];
</script>
