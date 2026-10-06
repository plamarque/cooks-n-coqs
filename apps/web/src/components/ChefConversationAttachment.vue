<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getChefConversationAssetBlobUrl } from "../storage/db";

const props = defineProps<{ assetId: string; label: string }>();
const url = ref<string>();
const unavailable = ref(false);
let loadToken = 0;
let disposed = false;

async function load(): Promise<void> {
  const token = ++loadToken;
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = undefined;
  unavailable.value = false;
  try {
    const nextUrl = await getChefConversationAssetBlobUrl(props.assetId);
    if (disposed || token !== loadToken) {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      return;
    }
    url.value = nextUrl;
    unavailable.value = !nextUrl;
  } catch {
    if (!disposed && token === loadToken) unavailable.value = true;
  }
}
onMounted(load);
watch(() => props.assetId, load);
onBeforeUnmount(() => {
  disposed = true;
  ++loadToken;
  if (url.value) URL.revokeObjectURL(url.value);
});
</script>

<template>
  <img v-if="url" :src="url" :alt="label" class="assistant-attachment-preview" />
  <span v-else class="assistant-attachment-unavailable" role="status">Photo indisponible localement : {{ label }}</span>
</template>
