<script setup lang="ts">
import { ref } from "vue";
import chefRepos from "../assets/chef/chef-repos.png";
import chefReposFallback from "../assets/chef/chef-repos-fallback.png";

const source = ref(chefRepos);
const assetUnavailable = ref(false);
const restDurationSeconds = 9 + Math.random() * 5;
const restStyle = { "--chef-rest-duration": `${restDurationSeconds.toFixed(2)}s` };

function showFallback(): void {
  if (source.value !== chefReposFallback) {
    source.value = chefReposFallback;
  } else {
    assetUnavailable.value = true;
  }
}
</script>

<template>
  <figure class="chef-avatar" :style="restStyle" aria-hidden="true">
    <span v-if="!assetUnavailable" class="chef-avatar-motion">
      <img class="chef-avatar-image" :src="source" alt="" @error="showFallback" />
      <span class="chef-avatar-eyelid chef-avatar-eyelid--left" />
      <span class="chef-avatar-eyelid chef-avatar-eyelid--right" />
    </span>
    <span v-else class="chef-avatar-placeholder" />
  </figure>
</template>
