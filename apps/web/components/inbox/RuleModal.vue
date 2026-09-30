<script setup lang="ts">
import {
  RULE_COLOR_CLASSES,
  RULE_COLORS,
  type RuleColor,
} from "~/composables/ruleColors";
import { MESSAGE_STATUS_OPTIONS } from "~/composables/messageStatuses";

type InboxRule = Awaited<
  ReturnType<ReturnType<typeof useApi>["getRules"]>
>[number];
type Field =
  "from" | "to" | "subject" | "status" | "spam_score" | "has_attachment";
type Op =
  | "contains"
  | "not_contains"
  | "equals"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "lt";

const props = defineProps<{ inboxId: string; rule: InboxRule | null }>();
const emit = defineEmits<{ close: []; saved: []; deleted: [id: string] }>();

const api = useApi();
const toast = useToast();
const { confirm } = useConfirm();

const form = reactive<{
  name: string;
  color: RuleColor;
  logic: "AND" | "OR";
  conditions: { field: Field; op: Op; value: string }[];
}>({
  name: props.rule?.name ?? "",
  color: ((props.rule?.color as RuleColor) in RULE_COLOR_CLASSES
    ? props.rule?.color
    : "indigo") as RuleColor,
  logic: (props.rule?.logic as "AND" | "OR") ?? "AND",
  conditions: props.rule
    ? (props.rule.conditions.map((c) => ({ ...c })) as typeof form.conditions)
    : [{ field: "from", op: "contains", value: "" }],
});
const saving = ref(false);
const error = ref("");

const FIELDS: { value: Field; label: string }[] = [
  { value: "from", label: "From" },
  { value: "to", label: "To" },
  { value: "subject", label: "Subject" },
  { value: "status", label: "Status" },
  { value: "spam_score", label: "Spam Score" },
  { value: "has_attachment", label: "Has Attachment" },
];
const TEXT_OPS: { value: Op; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "equals", label: "is exactly" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
];
const OPS: Record<Field, { value: Op; label: string }[]> = {
  from: TEXT_OPS,
  to: TEXT_OPS.slice(0, 2),
  subject: TEXT_OPS,
  status: [{ value: "equals", label: "is" }],
  spam_score: [
    { value: "gt", label: "is greater than" },
    { value: "lt", label: "is less than" },
  ],
  has_attachment: [{ value: "equals", label: "is" }],
};
const LOGIC = [
  { value: "AND", label: "ALL" },
  { value: "OR", label: "ANY" },
];

const valueType = (f: Field) =>
  f === "status"
    ? "status"
    : f === "has_attachment"
      ? "boolean"
      : f === "spam_score"
        ? "number"
        : "text";

function onFieldChange(i: number) {
  const c = form.conditions[i];
  c.op = OPS[c.field][0].value;
  c.value =
    c.field === "has_attachment"
      ? "true"
      : c.field === "status"
        ? MESSAGE_STATUS_OPTIONS[0].value
        : "";
}

function onSwatchKeydown(e: KeyboardEvent, color: RuleColor) {
  const i = RULE_COLORS.indexOf(color);
  let next = -1;
  if (e.key === "ArrowRight" || e.key === "ArrowDown")
    next = (i + 1) % RULE_COLORS.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
    next = (i - 1 + RULE_COLORS.length) % RULE_COLORS.length;
  if (next === -1) return;
  e.preventDefault();
  form.color = RULE_COLORS[next];
  const group = (e.currentTarget as HTMLElement).parentElement;
  nextTick(() =>
    group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus(),
  );
}

async function save() {
  if (!form.name.trim()) {
    error.value = "Give the filter a name.";
    return;
  }
  if (
    form.conditions.some((c) => !c.value.trim() && c.field !== "has_attachment")
  ) {
    error.value = "Every condition needs a value.";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    const body = {
      name: form.name,
      color: form.color,
      conditions: form.conditions,
      logic: form.logic,
    };
    if (props.rule) await api.updateRule(props.inboxId, props.rule.id, body);
    else await api.createRule(props.inboxId, body);
    emit("saved");
  } catch (e: any) {
    error.value = e?.data?.error || "Couldn't save the filter. Try again.";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.rule) return;
  const ok = await confirm({
    title: "Delete this filter?",
    message: `“${props.rule.name}” will be removed. The messages it matched aren't affected.`,
    confirmLabel: "Delete filter",
    danger: true,
  });
  if (!ok) return;
  try {
    await api.deleteRule(props.inboxId, props.rule.id);
    toast.success("Filter deleted");
    emit("deleted", props.rule.id);
  } catch {
    toast.error("Couldn't delete the filter. Please try again.");
  }
}
</script>

<template>
  <Modal
    :title="rule ? 'Edit filter' : 'New filter'"
    max-width="lg"
    @close="emit('close')"
  >
    <form id="rule-form" class="space-y-4" @submit.prevent="save">
      <div>
        <label
          for="rule-name"
          class="block text-sm text-gray-700 dark:text-gray-300 mb-1"
          >Name</label
        >
        <input
          id="rule-name"
          v-model="form.name"
          type="text"
          required
          placeholder="e.g. Deploy notifications"
          class="field"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span
          id="rule-color-label"
          class="text-sm text-gray-700 dark:text-gray-300"
          >Color</span
        >
        <div
          role="radiogroup"
          aria-labelledby="rule-color-label"
          class="flex gap-1"
        >
          <button
            v-for="c in RULE_COLORS"
            :key="c"
            type="button"
            role="radio"
            :aria-checked="form.color === c"
            :aria-label="c"
            :tabindex="form.color === c ? 0 : -1"
            class="w-7 h-7 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 focus-visible:ring-indigo-500"
            :class="[
              RULE_COLOR_CLASSES[c].swatch,
              form.color === c
                ? 'ring-2 ring-offset-2 dark:ring-offset-gray-800 ring-gray-500 scale-110'
                : 'hover:scale-105',
            ]"
            @click="form.color = c"
            @keydown="onSwatchKeydown($event, c)"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-gray-700 dark:text-gray-300">Match</span>
        <SegmentedControl
          :model-value="form.logic"
          :options="LOGIC"
          label="Match mode"
          @update:model-value="form.logic = $event === 'OR' ? 'OR' : 'AND'"
        />
        <span class="text-gray-700 dark:text-gray-300"
          >of the following conditions</span
        >
      </div>

      <div class="space-y-2">
        <div
          v-for="(cond, i) in form.conditions"
          :key="i"
          role="group"
          :aria-label="`Condition ${i + 1}`"
          class="flex flex-wrap items-center gap-2"
        >
          <select
            v-model="cond.field"
            aria-label="Field"
            class="field flex-1 min-w-[7rem] w-auto"
            @change="onFieldChange(i)"
          >
            <option v-for="f in FIELDS" :key="f.value" :value="f.value">
              {{ f.label }}
            </option>
          </select>
          <select
            v-model="cond.op"
            aria-label="Operator"
            class="field flex-1 min-w-[7rem] w-auto"
          >
            <option
              v-for="op in OPS[cond.field]"
              :key="op.value"
              :value="op.value"
            >
              {{ op.label }}
            </option>
          </select>
          <select
            v-if="valueType(cond.field) === 'status'"
            v-model="cond.value"
            aria-label="Status"
            class="field flex-1 min-w-[7rem] w-auto"
          >
            <option
              v-for="s in MESSAGE_STATUS_OPTIONS"
              :key="s.value"
              :value="s.value"
            >
              {{ s.label }}
            </option>
          </select>
          <select
            v-else-if="valueType(cond.field) === 'boolean'"
            v-model="cond.value"
            aria-label="Value"
            class="field flex-1 min-w-[7rem] w-auto"
          >
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
          <input
            v-else
            v-model="cond.value"
            :type="valueType(cond.field) === 'number' ? 'number' : 'text'"
            aria-label="Value"
            placeholder="value"
            class="field flex-1 min-w-[7rem] w-auto"
          />
          <button
            type="button"
            class="icon-btn hover:text-red-700 disabled:opacity-30"
            :aria-label="`Remove condition ${i + 1}`"
            :disabled="form.conditions.length === 1"
            @click="form.conditions.splice(i, 1)"
          >
            <Icon name="lucide:x" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <UBtn
        type="button"
        variant="ghost"
        size="sm"
        icon="lucide:plus"
        @click="
          form.conditions.push({ field: 'from', op: 'contains', value: '' })
        "
      >
        Add condition
      </UBtn>

      <InlineError v-if="error">{{ error }}</InlineError>
    </form>
    <template #footer>
      <UBtn
        v-if="rule"
        type="button"
        variant="danger"
        size="sm"
        class="mr-auto"
        @click="remove"
        >Delete filter</UBtn
      >
      <UBtn type="button" variant="ghost" @click="emit('close')">Cancel</UBtn>
      <UBtn type="submit" form="rule-form" :loading="saving">{{
        saving ? "Saving…" : "Save filter"
      }}</UBtn>
    </template>
  </Modal>
</template>
