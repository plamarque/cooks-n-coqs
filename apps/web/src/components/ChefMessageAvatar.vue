<script setup lang="ts">
import { ref } from "vue";
import chefRepos from "../assets/chef/chef-repos.png";
import chefReposFallback from "../assets/chef/chef-repos-fallback.png";

const source = ref(chefRepos);

function showFallback(): void {
  source.value = chefReposFallback;
}
</script>

<template>
  <span class="chef-message-avatar" aria-hidden="true">
    <img :src="source" alt="" @error="showFallback" />
  </span>
</template>
