<script setup lang="ts">
// A button that opens a menu of actions: click-outside, Escape (focus returns
// to the trigger), arrow/Home/End keys, and menuitem semantics.
interface Item {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  /** A non-interactive group heading (no key events). */
  heading?: boolean;
  separatorBefore?: boolean;
}

const props = withDefaults(
  defineProps<{
    label: string;
    icon?: string;
    items: Item[];
    align?: "left" | "right";
    variant?: "secondary" | "ghost";
  }>(),
  { align: "right", variant: "secondary" },
);
const emit = defineEmits<{ select: [key: string] }>();

// A heading item labels the items after it (up to the next heading or
// separator) as an ARIA group, so "CSV" is read as "Export … CSV".
const groups = computed(() => {
  const out: {
    id: string;
    heading?: Item;
    separator: boolean;
    items: Item[];
  }[] = [];
  for (const item of props.items) {
    const last = out[out.length - 1];
    if (item.heading)
      out.push({
        id: item.key,
        heading: item,
        separator: !!item.separatorBefore,
        items: [],
      });
    else if (!last || item.separatorBefore)
      out.push({
        id: item.key,
        separator: !!last && !!item.separatorBefore,
        items: [item],
      });
    else last.items.push(item);
  }
  return out;
});

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const menuId = useId();

const menuItems = () => [
  ...(rootRef.value?.querySelectorAll<HTMLElement>(
    '[role="menuitem"]:not([disabled])',
  ) ?? []),
];

function toggle() {
  open.value = !open.value;
  if (open.value) nextTick(() => menuItems()[0]?.focus());
}

function close(returnFocus = false) {
  open.value = false;
  if (returnFocus)
    nextTick(() =>
      rootRef.value?.querySelector<HTMLElement>("[aria-haspopup]")?.focus(),
    );
}

function choose(item: Item) {
  if (item.disabled || item.heading) return;
  close(true);
  emit("select", item.key);
}

function onKeydown(e: KeyboardEvent) {
  const items = menuItems();
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (e.key === "ArrowDown") {
    e.preventDefault();
    items[(i + 1) % items.length]?.focus();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    items[(i - 1 + items.length) % items.length]?.focus();
  } else if (e.key === "Home") {
    e.preventDefault();
    items[0]?.focus();
  } else if (e.key === "End") {
    e.preventDefault();
    items[items.length - 1]?.focus();
  } else if (e.key === "Escape") {
    e.stopPropagation();
    close(true);
  } else if (e.key === "Tab") {
    close();
  }
}

function onDocClick(e: MouseEvent) {
  if (open.value && rootRef.value && !rootRef.value.contains(e.target as Node))
    close();
}
onMounted(() => document.addEventListener("click", onDocClick));
onUnmounted(() => document.removeEventListener("click", onDocClick));
</script>

<template>
  <div ref="rootRef" class="relative">
    <UBtn
      :variant="props.variant"
      size="sm"
      aria-haspopup="menu"
      :aria-controls="open ? menuId : undefined"
      :aria-expanded="open"
      :icon="icon"
      @click="toggle"
    >
      {{ label }}
      <Icon name="lucide:chevron-down" class="w-4 h-4" aria-hidden="true" />
    </UBtn>
    <div
      v-if="open"
      :id="menuId"
      role="menu"
      :aria-label="label"
      class="absolute top-full mt-1 z-30 min-w-56 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
      :class="align === 'right' ? 'right-0' : 'left-0'"
      @keydown="onKeydown"
    >
      <template v-for="group in groups" :key="group.id">
        <div
          v-if="group.separator"
          role="separator"
          class="my-1 border-t border-gray-100 dark:border-gray-700"
        />
        <div
          role="group"
          :aria-labelledby="group.heading ? `${menuId}-${group.id}` : undefined"
        >
          <p
            v-if="group.heading"
            :id="`${menuId}-${group.id}`"
            class="px-3 pt-1 pb-1 text-xs font-medium text-gray-600 dark:text-gray-400"
          >
            {{ group.heading.label }}
          </p>
          <button
            v-for="item in group.items"
            :key="item.key"
            type="button"
            role="menuitem"
            :disabled="item.disabled"
            class="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:bg-gray-100 dark:focus-visible:bg-gray-700 disabled:opacity-50"
            :class="
              item.danger
                ? 'text-red-700 dark:text-red-400'
                : 'text-gray-700 dark:text-gray-300'
            "
            @click="choose(item)"
          >
            <Icon
              v-if="item.icon"
              :name="item.icon"
              class="w-4 h-4 shrink-0"
              aria-hidden="true"
            />
            {{ item.label }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
