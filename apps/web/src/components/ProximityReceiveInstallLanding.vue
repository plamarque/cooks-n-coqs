<script setup lang="ts">
import Dialog from "primevue/dialog";
import Button from "primevue/button";

defineProps<{
  visible: boolean;
  displayTitle?: string;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  continue: [];
}>();

function onContinue() {
  emit("continue");
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
    class="proximity-receive-install-dialog"
    :pt="{ mask: { class: 'proximity-receive-install-mask' } }"
    aria-labelledby="proximity-receive-install-title"
    @update:visible="onVisibleUpdate"
  >
    <div class="proximity-receive-install-sheet">
      <div class="proximity-receive-install-logo" aria-hidden="true">C&amp;C</div>
      <h2 id="proximity-receive-install-title" class="proximity-receive-install-title">
        Installer Cookies &amp; Coquillettes
      </h2>
      <p class="proximity-receive-install-lead">
        <template v-if="displayTitle">
          Alice t’envoie <strong>{{ displayTitle }}</strong>.
          Installe l’app pour l’ajouter à ton carnet.
        </template>
        <template v-else>
          Alice te partage une recette. Installe l’app pour l’ajouter à ton carnet.
        </template>
      </p>
      <div class="proximity-receive-install-pill">
        <strong>Sur iPhone</strong>
        Partager → Sur l’écran d’accueil
      </div>
      <div class="proximity-receive-install-pill">
        <strong>Sur Android</strong>
        Installer l’application (bannière du navigateur)
      </div>
      <Button
        label="Continuer vers la recette"
        class="proximity-receive-install-cta"
        @click="onContinue"
      />
      <p class="proximity-receive-install-fine">
        Après installation, ce lien reprendra le partage
      </p>
    </div>
  </Dialog>
</template>

<style scoped>
.proximity-receive-install-sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0;
}

.proximity-receive-install-logo {
  width: 4.5rem;
  height: 4.5rem;
  margin: 0 0 1rem;
  border-radius: 1rem;
  background: var(--p-primary-color, #1f4f46);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.4rem;
}

.proximity-receive-install-title {
  margin: 0 0 0.5rem;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--p-primary-color, #1f4f46);
}

.proximity-receive-install-lead {
  margin: 0 0 1.25rem;
  font-size: 0.95rem;
  line-height: 1.45;
  color: #3e4b46;
  max-width: 18rem;
}

.proximity-receive-install-lead strong {
  color: var(--p-primary-color, #1f4f46);
}

.proximity-receive-install-pill {
  align-self: stretch;
  background: #fff;
  border-radius: 0.75rem;
  padding: 0.85rem 1rem;
  margin-bottom: 0.75rem;
  text-align: left;
  font-size: 0.85rem;
  color: #3e4b46;
  box-shadow: 0 2px 10px rgba(31, 79, 70, 0.06);
}

.proximity-receive-install-pill strong {
  color: #1d1f1c;
  display: block;
  margin-bottom: 0.2rem;
}

.proximity-receive-install-cta {
  width: 100%;
  min-height: 2.75rem;
  margin-top: 0.5rem;
  border-radius: 0.5rem !important;
}

.proximity-receive-install-fine {
  margin: 0.75rem 0 0;
  font-size: 0.75rem;
  color: #3e4b46;
}
</style>

<style>
.proximity-receive-install-dialog.p-dialog {
  border-radius: 1rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

/* Scrim DESIGN via pt.mask : --px-mask-background pour l’anim Aura, background en secours. */
.proximity-receive-install-mask {
  --px-mask-background: rgba(29, 31, 28, 0.45);
  background: rgba(29, 31, 28, 0.45);
}
</style>
