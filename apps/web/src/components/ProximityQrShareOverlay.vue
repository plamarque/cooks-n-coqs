<script setup lang="ts">
import { computed } from "vue";
import Dialog from "primevue/dialog";
import Button from "primevue/button";
import { QrcodeSvg } from "qrcode.vue";

const props = defineProps<{
  visible: boolean;
  deepLinkUrl: string;
  recipeTitle?: string;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
}>();

const trimmedDeepLink = computed(() => props.deepLinkUrl.trim());
const hasDeepLink = computed(() => trimmedDeepLink.value.length > 0);

function close() {
  emit("update:visible", false);
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
    class="proximity-qr-share-dialog"
    :pt="{ mask: { class: 'proximity-qr-share-mask' } }"
    aria-labelledby="proximity-qr-share-title"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <div class="proximity-qr-share-sheet">
      <h2 id="proximity-qr-share-title" class="proximity-qr-share-title">
        Partager cette recette
      </h2>
      <p v-if="recipeTitle" class="proximity-qr-share-recipe-title">{{ recipeTitle }}</p>
      <p class="proximity-qr-share-help">
        Scanne avec l’appareil photo de l’autre téléphone
      </p>
      <div
        v-if="hasDeepLink"
        class="proximity-qr-share-frame"
        role="img"
        aria-label="QR de partage proximité"
      >
        <QrcodeSvg
          :value="trimmedDeepLink"
          :size="210"
          level="M"
          :margin="2"
          background="#ffffff"
          foreground="#1d1f1c"
          class="proximity-qr-share-svg"
        />
      </div>
      <p v-else class="proximity-qr-share-error" role="alert">
        Impossible d’afficher le QR : lien de partage manquant.
      </p>
      <p class="proximity-qr-share-hint">Laisse cet écran ouvert le temps du scan</p>
      <Button
        label="Fermer"
        class="proximity-qr-share-close"
        severity="secondary"
        outlined
        @click="close"
      />
    </div>
  </Dialog>
</template>

<style scoped>
.proximity-qr-share-sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0;
}

.proximity-qr-share-title {
  margin: 0 0 0.35rem;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--p-primary-color, #1f4f46);
}

.proximity-qr-share-recipe-title {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #1d1f1c;
}

.proximity-qr-share-help {
  margin: 0 0 1rem;
  font-size: 0.85rem;
  color: #3e4b46;
}

.proximity-qr-share-frame {
  width: 210px;
  height: 210px;
  margin: 0 auto 0.75rem;
  border-radius: 0.5rem;
  border: 2px solid #e5e0d6;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.proximity-qr-share-svg {
  display: block;
  width: 210px;
  height: 210px;
}

.proximity-qr-share-error {
  margin: 0 0 0.75rem;
  padding: 0.75rem;
  width: 100%;
  box-sizing: border-box;
  min-height: 210px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  color: #9f1239;
  background: rgba(225, 29, 72, 0.08);
  border-radius: 0.5rem;
}

.proximity-qr-share-hint {
  margin: 0 0 1rem;
  font-size: 0.8rem;
  color: #3e4b46;
}

.proximity-qr-share-close {
  width: 100%;
  min-height: 2.75rem;
  border-radius: 0.5rem !important;
}
</style>

<style>
.proximity-qr-share-dialog.p-dialog {
  border-radius: 1rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

/* Scrim DESIGN via pt.mask : --px-mask-background pour l’anim Aura, background en secours. */
.proximity-qr-share-mask {
  --px-mask-background: rgba(29, 31, 28, 0.45);
  background: rgba(29, 31, 28, 0.45);
}
</style>
