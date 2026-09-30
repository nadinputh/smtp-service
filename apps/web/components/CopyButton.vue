<script setup lang="ts">
// Copy-to-clipboard icon button: flips to a check for 2s, reports failure.
const props = defineProps<{ text: string; label: string }>();
const toast = useToast();
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied.value = false), 2000);
  } catch {
    toast.error("Couldn't copy to the clipboard.");
  }
}
onUnmounted(() => clearTimeout(timer));
</script>

<template>
  <button
    type="button"
    class="icon-btn"
    :aria-label="copied ? `${label} copied` : `Copy ${label}`"
    @click="copy"
  >
    <Icon :name="copied ? 'lucide:check' : 'lucide:copy'" class="w-4 h-4" />
  </button>
</template>
