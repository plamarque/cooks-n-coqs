<script setup lang="ts">
import { computed, ref } from "vue";
import Popover from "primevue/popover";
import type { IngredientLine } from "@cookies-et-coquilettes/domain";
import IngredientImage from "./IngredientImage.vue";
import { stepIngredientOverflowCount } from "../utils/step-ingredient-display";

const props = defineProps<{
  ingredients: IngredientLine[];
  refreshKey: number;
  variant: "prep" | "cooking";
}>();

const emit = defineEmits<{
  detail: [IngredientLine];
}>();

const MAX_VISIBLE = 3;

const popoverRef = ref<{ toggle: (e: Event) => void; hide: () => void } | null>(null);
const popoverOpen = ref(false);

const showOverflow = computed(() => props.ingredients.length > MAX_VISIBLE);
const overflowCount = computed(() => stepIngredientOverflowCount(props.ingredients.length, MAX_VISIBLE));
const displaySlice = computed(() => props.ingredients.slice(0, MAX_VISIBLE));

const btnClass = computed(() =>
  props.variant === "prep" ? "prep-step-ingredient-img-btn" : "cooking-step-ingredient-icon-btn"
);
const imgClass = computed(() =>
  props.variant === "prep"
    ? "ingredient-icon ingredient-icon--prep-step"
    : "ingredient-icon ingredient-icon--cooking-step"
);

const rootClass = computed(() =>
  props.variant === "prep"
    ? "step-mentioned-ingredient-icons step-mentioned-ingredient-icons--prep"
    : "step-mentioned-ingredient-icons step-mentioned-ingredient-icons--cooking"
);

function openDetail(ingredient: IngredientLine): void {
  emit("detail", ingredient);
}

function onIconClick(event: Event, ingredient: IngredientLine, index: number): void {
  if (index === MAX_VISIBLE - 1 && showOverflow.value) {
    popoverRef.value?.toggle(event);
    return;
  }
  openDetail(ingredient);
}

function onPopoverPick(ingredient: IngredientLine): void {
  popoverRef.value?.hide();
  openDetail(ingredient);
}

function ariaLabelForIndex(ingredient: IngredientLine, index: number): string {
  if (index === MAX_VISIBLE - 1 && showOverflow.value) {
    const n = props.ingredients.length;
    return `Voir les ${n} ingrédients de cette étape (${overflowCount.value} en plus)`;
  }
  return `Voir ${ingredient.label}`;
}
</script>

<template>
  <div :class="rootClass">
    <button
      v-for="(ingredient, index) in displaySlice"
      :key="ingredient.id"
      type="button"
      :class="[btnClass, index === MAX_VISIBLE - 1 && showOverflow ? 'step-mentioned-ingredient-more-wrap' : null]"
      :aria-label="ariaLabelForIndex(ingredient, index)"
      :title="index === MAX_VISIBLE - 1 && showOverflow ? undefined : ingredient.label"
      :aria-expanded="index === MAX_VISIBLE - 1 && showOverflow ? popoverOpen : undefined"
      :aria-haspopup="index === MAX_VISIBLE - 1 && showOverflow ? 'dialog' : undefined"
      @click="onIconClick($event, ingredient, index)"
    >
      <IngredientImage
        :label="ingredient.label"
        :image-id="ingredient.imageId"
        :refresh-key="refreshKey"
        :img-class="imgClass"
        :fallback-class="imgClass"
        :alt="`Ingrédient ${ingredient.label}`"
      />
      <span
        v-if="index === MAX_VISIBLE - 1 && showOverflow"
        class="step-mentioned-ingredient-more-badge"
        aria-hidden="true"
        >+{{ overflowCount }}</span
      >
    </button>

    <Popover
      ref="popoverRef"
      class="step-mentioned-ingredients-popover"
      @show="popoverOpen = true"
      @hide="popoverOpen = false"
    >
      <div class="step-mentioned-ingredients-popover-panel" role="list">
        <button
          v-for="ingredient in ingredients"
          :key="ingredient.id"
          type="button"
          class="step-mentioned-ingredients-popover-row"
          role="listitem"
          @click="onPopoverPick(ingredient)"
        >
          <IngredientImage
            :label="ingredient.label"
            :image-id="ingredient.imageId"
            :refresh-key="refreshKey"
            img-class="step-mentioned-ingredients-popover-img"
            fallback-class="step-mentioned-ingredients-popover-img"
            :alt="`Ingrédient ${ingredient.label}`"
          />
          <span class="step-mentioned-ingredients-popover-label">{{ ingredient.label }}</span>
        </button>
      </div>
    </Popover>
  </div>
</template>
