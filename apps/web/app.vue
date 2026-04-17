<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
const darkMode = useDarkMode();

onMounted(() => {
  darkMode.init();
});
</script>
