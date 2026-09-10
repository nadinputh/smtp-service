<template>
  <div class="relative">
    <input
      :id="id"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      :type="show ? 'text' : 'password'"
      :required="required"
      :minlength="minlength"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      class="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder:text-gray-500 dark:placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
    />
    <button
      type="button"
      tabindex="-1"
      @click="show = !show"
      :aria-label="show ? 'Hide password' : 'Show password'"
      class="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
    >
      <Icon :name="show ? 'lucide:eye-off' : 'lucide:eye'" class="w-4 h-4" />
    </button>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    id: string;
    modelValue: string;
    required?: boolean;
    minlength?: number;
    autocomplete?: string;
    placeholder?: string;
  }>(),
  {
    required: false,
    autocomplete: "current-password",
    placeholder: "••••••••",
  },
);
defineEmits<{ "update:modelValue": [value: string] }>();

const show = ref(false);
</script>
