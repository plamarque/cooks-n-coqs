<script setup lang="ts">
import { computed, ref, watch } from "vue";
import chefEcoute from "../assets/chef/chef-ecoute.png";
import chefProposition from "../assets/chef/chef-proposition.png";
import chefQuestion from "../assets/chef/chef-question.png";
import chefReflexion from "../assets/chef/chef-reflexion.png";
import chefRepos from "../assets/chef/chef-repos.png";
import chefReposFallback from "../assets/chef/chef-repos-fallback.png";
import chefReussite from "../assets/chef/chef-reussite.png";

const CHEF_STATES = ["repos", "ecoute", "reflexion", "proposition", "reussite", "question"] as const;
type ChefState = (typeof CHEF_STATES)[number];

const props = withDefaults(defineProps<{ state?: ChefState }>(), { state: "repos" });
const previewState = ref<ChefState | null>(null);
const assetUnavailable = ref(false);
const restSource = ref(chefRepos);
const restDurationSeconds = ref(9 + Math.random() * 5);

const activeState = computed(() => previewState.value ?? props.state);
const activeSprite = computed(() => ({
  ecoute: chefEcoute,
  reflexion: chefReflexion,
  proposition: chefProposition,
  reussite: chefReussite,
  question: chefQuestion
})[activeState.value as Exclude<ChefState, "repos">]);
const restStyle = computed(() => ({ "--chef-rest-duration": `${restDurationSeconds.value.toFixed(2)}s` }));
const spriteStyle = computed(() => ({ "--chef-sprite": `url("${activeSprite.value ?? ""}")` }));

watch(() => props.state, () => {
  previewState.value = null;
  assetUnavailable.value = false;
});

watch(activeState, (state) => {
  assetUnavailable.value = false;
  if (state === "repos") restDurationSeconds.value = 9 + Math.random() * 5;
});

function showRestFallback(): void {
  if (restSource.value !== chefReposFallback) restSource.value = chefReposFallback;
  else assetUnavailable.value = true;
}

function showSpriteUnavailable(): void {
  assetUnavailable.value = true;
}

function advancePreview(): void {
  const currentIndex = CHEF_STATES.indexOf(activeState.value);
  previewState.value = CHEF_STATES[(currentIndex + 1) % CHEF_STATES.length];
}

function onPreviewKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  advancePreview();
}
</script>

<template>
  <figure
    class="chef-avatar"
    :class="`chef-avatar--${activeState}`"
    :data-chef-state="activeState"
    :style="activeState === 'repos' ? restStyle : spriteStyle"
    role="button"
    tabindex="0"
    aria-label="Afficher l’état suivant du Chef"
    @click="advancePreview"
    @keydown="onPreviewKeydown"
  >
    <span v-if="activeState === 'repos' && !assetUnavailable" class="chef-avatar-motion">
      <img class="chef-avatar-image" :src="restSource" alt="" @error="showRestFallback" />
      <span class="chef-avatar-eyelid chef-avatar-eyelid--left" />
      <span class="chef-avatar-eyelid chef-avatar-eyelid--right" />
    </span>
    <span v-else-if="activeState !== 'repos' && !assetUnavailable" class="chef-avatar-sprite" aria-hidden="true">
      <img class="chef-avatar-sprite-preload" :src="activeSprite ?? ''" alt="" @error="showSpriteUnavailable" />
    </span>
    <span v-else class="chef-avatar-placeholder" aria-hidden="true" />
  </figure>
</template>
