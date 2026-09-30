<script setup lang="ts">
// The one badge/pill primitive: tone picks the color, the label is always text.
import { BADGE_TONES, type BadgeTone } from "~/composables/badgeTones";

withDefaults(defineProps<{ tone?: BadgeTone }>(), { tone: "neutral" });
</script>

<template>
  <span
    class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
    :class="BADGE_TONES[tone]"
  >
    <slot />
  </span>
</template>
