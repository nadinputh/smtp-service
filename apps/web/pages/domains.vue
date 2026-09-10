<template>
  <UpcomingPage
    title="Domains"
    description="Manage sending domains &amp; DKIM keys"
    icon="lucide:globe"
    :features="features"
  />
</template>

<script setup lang="ts">
definePageMeta({ layout: "default" });
useHead({ title: "Domains" });

const features = [
  {
    icon: "lucide:key-round",
    label: "DKIM signing",
    description:
      "Auto-generate DKIM keys for each domain to sign outbound emails.",
  },
  {
    icon: "lucide:shield-check",
    label: "One-click DNS verification",
    description:
      "Check that your DKIM TXT record is published correctly, right from the dashboard.",
  },
  {
    icon: "lucide:list-checks",
    label: "Verification status",
    description:
      "See at a glance which of your sending domains are verified and ready to send.",
  },
];
</script>
