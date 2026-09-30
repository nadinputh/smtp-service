<script setup lang="ts" generic="T extends string">
// A single-choice control: a radiogroup with roving focus (arrows move and
// select, Tab leaves the group), so it reads as "one of N" to assistive tech.
interface Option {
  value: T;
  label: string;
  icon?: string;
  title?: string;
}
const props = defineProps<{
  options: Option[];
  modelValue: T;
  label: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: T] }>();

const groupRef = ref<HTMLElement | null>(null);

function onKeydown(e: KeyboardEvent) {
  const values = props.options.map((o) => o.value);
  const i = values.indexOf(props.modelValue);
  let next = -1;
  if (e.key === "ArrowRight" || e.key === "ArrowDown")
    next = (i + 1) % values.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
    next = (i - 1 + values.length) % values.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = values.length - 1;
  if (next === -1) return;
  e.preventDefault();
  emit("update:modelValue", values[next]);
  nextTick(() =>
    groupRef.value
      ?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')
      ?.focus(),
  );
}
</script>

<template>
  <div
    ref="groupRef"
    role="radiogroup"
    :aria-label="label"
    class="inline-flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5"
    @keydown="onKeydown"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === opt.value"
      :tabindex="modelValue === opt.value ? 0 : -1"
      :title="opt.title"
      class="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      :class="
        modelValue === opt.value
          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
          : 'text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
      "
      @click="emit('update:modelValue', opt.value)"
    >
      <Icon
        v-if="opt.icon"
        :name="opt.icon"
        class="w-3.5 h-3.5"
        aria-hidden="true"
      />
      {{ opt.label }}
    </button>
  </div>
</template>
