<script setup lang="ts">
// Rendered once in the layout; useConfirm().confirm() drives it. It's an
// alertdialog whose message is its description, and it opens on Cancel.
const { pending, settle } = useConfirm();
</script>

<template>
  <Modal
    v-if="pending"
    :title="pending.title"
    role="alertdialog"
    :described-by="pending.message ? 'confirm-description' : undefined"
    @close="settle(false)"
  >
    <p
      v-if="pending.message"
      id="confirm-description"
      class="text-sm text-gray-600 dark:text-gray-300"
    >
      {{ pending.message }}
    </p>
    <template #footer>
      <UBtn type="button" variant="ghost" @click="settle(false)">Cancel</UBtn>
      <UBtn
        type="button"
        :variant="pending.danger ? 'danger-filled' : 'primary'"
        @click="settle(true)"
      >
        {{ pending.confirmLabel ?? "Confirm" }}
      </UBtn>
    </template>
  </Modal>
</template>
