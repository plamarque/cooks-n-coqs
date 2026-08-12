<script setup lang="ts">
import Dialog from "primevue/dialog";
import Button from "primevue/button";

defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  cancel: [];
}>();

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
    :closeOnEscape="false"
    :dismissable-mask="false"
    :style="{ width: 'min(96vw, 22rem)' }"
    :content-style="{ padding: '1.25rem 1rem 1rem' }"
    class="proximity-receive-update-dialog"
    :pt="{ mask: { class: 'proximity-receive-update-mask' } }"
    aria-labelledby="proximity-receive-update-title"
    @update:visible="onVisibleUpdate"
  >
    <div class="proximity-receive-update-sheet">
      <h2 id="proximity-receive-update-title" class="proximity-receive-update-title">
        Mise à jour requise
      </h2>
      <p class="proximity-receive-update-lead">
        Cette version de Cookies &amp; Coquillettes ne peut pas encore recevoir ce partage.
        Mets à jour l’app, puis rouvre le même lien pour continuer.
      </p>
      <Button
        label="Annuler"
        class="proximity-receive-update-cancel"
        severity="secondary"
        outlined
        @click="onCancel"
      />
    </div>
  </Dialog>
</template>

<style scoped>
.proximity-receive-update-sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0;
}

.proximity-receive-update-title {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--p-primary-color, #1f4f46);
}

.proximity-receive-update-lead {
  margin: 0 0 1.25rem;
  font-size: 0.95rem;
  line-height: 1.45;
  color: #3e4b46;
}

.proximity-receive-update-cancel {
  width: 100%;
  min-height: 2.75rem;
  border-radius: 0.5rem !important;
}
</style>

<style>
.proximity-receive-update-dialog.p-dialog {
  border-radius: 1rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

/* Scrim DESIGN via pt.mask : --px-mask-background pour l’anim Aura, background en secours. */
.proximity-receive-update-mask {
  --px-mask-background: rgba(29, 31, 28, 0.45);
  background: rgba(29, 31, 28, 0.45);
}
</style>
