<script setup lang="ts">
import Dialog from "primevue/dialog";
import Button from "primevue/button";

defineProps<{
  visible: boolean;
  displayTitle: string;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  confirm: [];
  cancel: [];
}>();

function onConfirm() {
  emit("confirm");
}

function onCancel() {
  emit("cancel");
}

function onVisibleUpdate(value: boolean) {
  emit("update:visible", value);
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :showHeader="false"
    :closable="false"
    :dismissable-mask="true"
    :style="{ width: 'min(96vw, 22rem)' }"
    :content-style="{ padding: '1.25rem 1rem 1rem' }"
    class="proximity-receive-confirm-dialog"
    :pt="{ mask: { class: 'proximity-receive-confirm-mask' } }"
    aria-labelledby="proximity-receive-confirm-title"
    @update:visible="onVisibleUpdate"
  >
    <div class="proximity-receive-confirm-sheet">
      <p class="proximity-receive-confirm-eyebrow">Alice te partage une recette</p>
      <h2 id="proximity-receive-confirm-title" class="proximity-receive-confirm-title">
        {{ displayTitle }}
      </h2>
      <p class="proximity-receive-confirm-blurb">
        Ajouter cette recette à ton carnet&nbsp;? Tu pourras l’ouvrir et la cuisiner comme
        n’importe quel import.
      </p>
      <div class="proximity-receive-confirm-actions">
        <Button
          label="Confirmer"
          class="proximity-receive-confirm-primary"
          @click="onConfirm"
        />
        <Button
          label="Annuler"
          class="proximity-receive-confirm-secondary"
          severity="secondary"
          outlined
          @click="onCancel"
        />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.proximity-receive-confirm-sheet {
  display: flex;
  flex-direction: column;
  text-align: left;
  gap: 0;
}

.proximity-receive-confirm-eyebrow {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #3e4b46;
}

.proximity-receive-confirm-title {
  margin: 0 0 0.75rem;
  font-size: 1.65rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--p-primary-color, #1f4f46);
}

.proximity-receive-confirm-blurb {
  margin: 0 0 1.25rem;
  font-size: 0.95rem;
  line-height: 1.45;
  color: #3e4b46;
}

.proximity-receive-confirm-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.proximity-receive-confirm-primary,
.proximity-receive-confirm-secondary {
  width: 100%;
  min-height: 2.75rem;
  border-radius: 0.5rem !important;
}
</style>

<style>
.proximity-receive-confirm-dialog.p-dialog {
  border-radius: 1rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

/* Scrim DESIGN via pt.mask : --px-mask-background pour l’anim Aura, background en secours. */
.proximity-receive-confirm-mask {
  --px-mask-background: rgba(29, 31, 28, 0.45);
  background: rgba(29, 31, 28, 0.45);
}
</style>
