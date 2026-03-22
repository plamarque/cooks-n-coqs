<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import Button from "primevue/button";
import Card from "primevue/card";
import ConfirmDialog from "primevue/confirmdialog";
import Dialog from "primevue/dialog";
import ProgressSpinner from "primevue/progressspinner";
import { useConfirm } from "primevue/useconfirm";
import type {
  ImportSource,
  IngredientLine,
  ParsedRecipeDraft,
  Recipe,
  RecipeCategory,
  RecipeFilters,
  ShareImportPayload
} from "@cookies-et-coquilettes/domain";
import { isRecipeValidForSave } from "@cookies-et-coquilettes/domain";
import RecipeImage from "./components/RecipeImage.vue";
import IngredientImage from "./components/IngredientImage.vue";
import IngredientDetailModal from "./components/IngredientDetailModal.vue";
import StepMentionedIngredientIcons from "./components/StepMentionedIngredientIcons.vue";
import { seedIfEmpty } from "./seed/seed-if-empty";
import { dexieRecipeService, storeImageFromFile, storeImageFromUrl } from "./services/recipe-service";
import { db } from "./storage/db";
import { browserCookingModeService } from "./services/cooking-mode-service";
import { bffImportService, generateRecipeImage } from "./services/import-service";
import {
  getCookingStepImageBlobUrl,
  resolveCookingStepImageId
} from "./services/cooking-step-image-service";
import { detectStepTimerDurationSeconds } from "./services/step-timer-service";
import { buildInstagramEmbedUrl } from "./utils/instagram-embed";
import { buildYouTubeEmbedUrl } from "./utils/youtube-embed";
import { extractStepTimerDurationSeconds } from "./utils/step-timer";
import {
  clearShareImportParamsFromWindowLocation,
  readShareImportPayloadFromWindow
} from "./services/share-target-service";

type ViewMode = "LIST" | "DETAIL" | "FORM" | "ADD_CHOICE";
type FormMode = "CREATE" | "EDIT";
type ImportProgressType = "url" | "text" | "screenshot" | "file" | "share";

interface IngredientInput {
  id: string;
  label: string;
  quantity: string;
  unit: string;
  isScalable: boolean;
  imageId?: string;
}

interface StepInput {
  id: string;
  text: string;
}

interface RecipeFormState {
  title: string;
  category: RecipeCategory;
  favorite: boolean;
  servingsBase: string;
  prepTimeMin: string;
  cookTimeMin: string;
  restTimeMin: string;
  ingredients: IngredientInput[];
  steps: StepInput[];
  source?: ImportSource;
  imageUrl?: string;
  imageId?: string | null;
}

interface CookingSessionTimingSummary {
  elapsedLabel: string;
  measuredPrepTimeMin: number;
  recipeId: string | null;
}

const recipes = ref<Recipe[]>([]);
const selectedRecipeId = ref<string | null>(null);
const viewMode = ref<ViewMode>("LIST");
const formMode = ref<FormMode>("CREATE");
const formRecipeId = ref<string | null>(null);
const cookingState = ref<"OFF" | "WAKE_LOCK" | "FALLBACK">("OFF");
const feedback = ref<string>("");
const feedbackType = ref<"success" | "warning">("success");
const errorMessage = ref<string>("");

const search = ref("");
const searchExpanded = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);

function toggleSearchExpanded() {
  const willExpand = !searchExpanded.value;
  searchExpanded.value = willExpand;
  if (willExpand) {
    nextTick(() => searchInputRef.value?.focus());
  }
}
const categoryFilter = ref<"ALL" | RecipeCategory>("ALL");
const favoriteOnly = ref(true);

const fileInputRef = ref<HTMLInputElement | null>(null);
const formImageInputRef = ref<HTMLInputElement | null>(null);
const pasteFieldContent = ref("");
const importBusy = ref(false);
const clipboardBusy = ref(false);
const importSourceType = ref<ImportProgressType | null>(null);
const imageGenerating = ref(false);
const imageReextracting = ref(false);
const recipeIdWithPendingImage = ref<string | null>(null);
const recipeImageFullscreenId = ref<string | null>(null);
const recipeImageFullscreenVisible = computed({
  get: () => Boolean(recipeImageFullscreenId.value),
  set: (v) => {
    if (!v) recipeImageFullscreenId.value = null;
  }
});
const imageLoadingMessage = ref<string>("");

const servingsInput = ref("");
const cookingStepIndex = ref(0);
const showCookingIngredients = ref(false);
const cookingSwipeStartX = ref<number | null>(null);
const currentCookingStepImageUrl = ref<string | null>(null);
let cookingStepImageLoadCounter = 0;
const stepTimerTotalSeconds = ref<number | null>(null);
const stepTimerRemainingSeconds = ref(0);
const stepTimerRunning = ref(false);
const stepTimerFinished = ref(false);
let stepTimerIntervalId: ReturnType<typeof setInterval> | null = null;
let stepTimerEndAt = 0;
let stepTimerDetectionCounter = 0;
const cookingModeStartedAt = ref<number | null>(null);
const cookingModeRecipeId = ref<string | null>(null);

const selectedIngredientForModal = ref<IngredientLine | null>(null);
const ingredientModalVisible = ref(false);
const ingredientImageRefreshKey = ref(0);

const FEATURE_PORTIONS_ENABLED = true;
const baseUrl = import.meta.env.BASE_URL;
const INGREDIENT_TOKEN_STOPWORDS = new Set([
  "de",
  "du",
  "des",
  "le",
  "la",
  "les",
  "au",
  "aux",
  "un",
  "une",
  "et",
  "ou",
  "a",
  "avec",
  "pour"
]);

const form = ref<RecipeFormState>(emptyForm());
const confirm = useConfirm();

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyIngredient(): IngredientInput {
  return { id: randomId(), label: "", quantity: "", unit: "", isScalable: true };
}

function emptyStep(): StepInput {
  return { id: randomId(), text: "" };
}

function emptyForm(): RecipeFormState {
  return {
    title: "",
    category: "SALE",
    favorite: false,
    servingsBase: "",
    prepTimeMin: "",
    cookTimeMin: "",
    restTimeMin: "",
    ingredients: [emptyIngredient()],
    steps: [emptyStep()]
  };
}

function parseNumber(value: string | number | undefined | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const str = String(value);
  const normalized = str.trim().replace(",", ".");
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function formatStepTimerClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatStepTimerDurationLabel(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${hours} h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} min`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds} s`);
  }
  return parts.join(" ");
}

function playStepTimerFinishedSignal(): void {
  if (typeof window === "undefined") {
    return;
  }

  const extendedWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextCtor = globalThis.AudioContext ?? extendedWindow.webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  const audioContext = new AudioContextCtor();
  void audioContext.resume();
  const startAt = audioContext.currentTime;
  const beepOffsets = [0, 0.24, 0.48];

  for (const offset of beepOffsets) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(980, startAt + offset);
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const beepStart = startAt + offset;
    const beepAttack = beepStart + 0.01;
    const beepRelease = beepStart + 0.12;
    gainNode.gain.setValueAtTime(0.0001, beepStart);
    gainNode.gain.exponentialRampToValueAtTime(0.18, beepAttack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, beepRelease);

    oscillator.start(beepStart);
    oscillator.stop(beepRelease + 0.02);
  }

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([100, 60, 100]);
  }

  window.setTimeout(() => {
    void audioContext.close();
  }, 900);
}

function normalizeForIngredientMatching(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractIngredientSearchTerms(label: string): string[] {
  const normalizedLabel = normalizeForIngredientMatching(label);
  if (!normalizedLabel) {
    return [];
  }

  const labelTokens = normalizedLabel
    .split(" ")
    .filter(
      (token) =>
        token.length >= 3 && !INGREDIENT_TOKEN_STOPWORDS.has(token)
    );
  return Array.from(new Set([normalizedLabel, ...labelTokens]));
}

function stepMentionsIngredient(stepTextNormalized: string, ingredientLabel: string): boolean {
  const terms = extractIngredientSearchTerms(ingredientLabel);
  if (terms.length === 0 || !stepTextNormalized) {
    return false;
  }

  return terms.some((term) => {
    if (term.includes(" ")) {
      return stepTextNormalized.includes(term);
    }
    const pluralSuffix = term.endsWith("s") || term.endsWith("x") ? "" : "(?:s|x)?";
    const tokenPattern = new RegExp(
      `(^|[^a-z0-9])${escapeRegExp(term)}${pluralSuffix}([^a-z0-9]|$)`
    );
    return tokenPattern.test(stepTextNormalized);
  });
}

function getMentionedIngredientsForStep(
  step: { text: string },
  ingredients: IngredientLine[]
): IngredientLine[] {
  const normalized = normalizeForIngredientMatching(step.text);
  if (!normalized) return [];
  return [...ingredients]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((ing) => stepMentionsIngredient(normalized, ing.label));
}

function toForm(recipe: Recipe): RecipeFormState {
  return {
    title: recipe.title,
    category: recipe.category,
    favorite: recipe.favorite,
    servingsBase: recipe.servingsBase ? String(recipe.servingsBase) : "",
    prepTimeMin: recipe.prepTimeMin ? String(recipe.prepTimeMin) : "",
    cookTimeMin: recipe.cookTimeMin ? String(recipe.cookTimeMin) : "",
    restTimeMin: recipe.restTimeMin ? String(recipe.restTimeMin) : "",
    ingredients:
      recipe.ingredients.length > 0
        ? [...recipe.ingredients]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((ingredient) => ({
              id: ingredient.id,
              label: ingredient.label,
              quantity:
                ingredient.quantity !== undefined ? String(ingredient.quantity) : "",
              unit: ingredient.unit ?? "",
              isScalable: ingredient.isScalable,
              imageId: ingredient.imageId
            }))
        : [emptyIngredient()],
    steps:
      recipe.steps.length > 0
        ? recipe.steps
            .sort((a, b) => a.order - b.order)
            .map((step) => ({ id: step.id, text: step.text }))
        : [emptyStep()],
    source: recipe.source,
    imageId: recipe.imageId
  };
}

function draftToForm(draft: ParsedRecipeDraft): RecipeFormState {
  return {
    title: draft.title,
    category: draft.category,
    favorite: false,
    servingsBase: draft.servingsBase ? String(draft.servingsBase) : "",
    prepTimeMin: draft.prepTimeMin ? String(draft.prepTimeMin) : "",
    cookTimeMin: draft.cookTimeMin ? String(draft.cookTimeMin) : "",
    restTimeMin: draft.restTimeMin ? String(draft.restTimeMin) : "",
    imageUrl: draft.imageUrl,
    imageId: undefined,
    ingredients:
      draft.ingredients.length > 0
        ? [...draft.ingredients]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((ingredient) => ({
              id: ingredient.id || randomId(),
              label: ingredient.label,
              quantity:
                ingredient.quantity !== undefined ? String(ingredient.quantity) : "",
              unit: ingredient.unit ?? "",
              isScalable: ingredient.isScalable,
              imageId: ingredient.imageId
            }))
        : [emptyIngredient()],
    steps:
      draft.steps.length > 0
        ? draft.steps
            .sort((a, b) => a.order - b.order)
            .map((step) => ({ id: step.id || randomId(), text: step.text }))
        : [emptyStep()],
    source: draft.source
  };
}

function sourceTypeLabel(source?: ImportSource): string {
  switch (source?.type) {
    case "SCREENSHOT":
      return "Image collée";
    case "TEXT":
      return "Texte collé";
    case "SHARE":
      return "Partage";
    case "URL":
      return "Lien";
    case "MANUAL":
      return "Saisie manuelle";
    default:
      return "Import";
  }
}

function importBusyLabel(type: ImportProgressType | null): string {
  switch (type) {
    case "share":
      return "Analyse du partage en cours…";
    case "url":
      return "Analyse du lien en cours…";
    case "text":
      return "Analyse du texte en cours…";
    case "screenshot":
      return "Lecture des images en cours…";
    case "file":
      return "Lecture du fichier en cours…";
    default:
      return "Import en cours…";
  }
}

function formToRecipe(existing?: Recipe): Recipe {
  const now = new Date().toISOString();
  const servingsBase = parseNumber(form.value.servingsBase);
  const source = form.value.source
    ? {
        type: form.value.source.type,
        url: form.value.source.url?.trim() || undefined,
        capturedAt: form.value.source.capturedAt
      }
    : existing?.source;
  const ingredients = form.value.ingredients
    .map((ingredient, index) => {
      const label = ingredient.label.trim();
      const quantity = parseNumber(ingredient.quantity);
      if (!label) {
        return null;
      }

      return {
        id: ingredient.id,
        order: index + 1,
        label,
        quantity,
        quantityBase: ingredient.isScalable ? quantity : undefined,
        unit: ingredient.unit.trim() || undefined,
        isScalable: ingredient.isScalable,
        rawText: label,
        imageId: ingredient.imageId
      };
    })
    .filter((ingredient): ingredient is NonNullable<typeof ingredient> => ingredient !== null);

  const steps = form.value.steps
    .map((step, index) => {
      const text = step.text.trim();
      if (!text) {
        return null;
      }
      return {
        id: step.id,
        order: index + 1,
        text
      };
    })
    .filter((step): step is NonNullable<typeof step> => step !== null);

  const recipe: Recipe = {
    id: existing?.id ?? randomId(),
    title: form.value.title.trim(),
    category: form.value.category,
    favorite: form.value.favorite,
    servingsBase,
    servingsCurrent: servingsBase,
    ingredients,
    steps,
    prepTimeMin: parseNumber(form.value.prepTimeMin),
    cookTimeMin: parseNumber(form.value.cookTimeMin),
    restTimeMin: parseNumber(form.value.restTimeMin),
    source,
    sourceImageIds: existing?.sourceImageIds,
    imageId:
      form.value.imageId === null
        ? undefined
        : form.value.imageId ?? existing?.imageId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  if (!recipe.servingsBase) {
    delete recipe.servingsBase;
    delete recipe.servingsCurrent;
  }

  return recipe;
}

const selectedRecipe = computed(() =>
  recipes.value.find((recipe) => recipe.id === selectedRecipeId.value) ?? null
);

const formRecipeSourceImageIds = computed(
  () => recipes.value.find((r) => r.id === formRecipeId.value)?.sourceImageIds ?? []
);

const selectedRecipeSteps = computed(() => {
  if (!selectedRecipe.value) {
    return [];
  }
  return [...selectedRecipe.value.steps].sort((a, b) => a.order - b.order);
});

const normalizedCookingStepIndex = computed(() => {
  const totalSteps = selectedRecipeSteps.value.length;
  if (totalSteps === 0) {
    return 0;
  }
  return ((cookingStepIndex.value % totalSteps) + totalSteps) % totalSteps;
});

const currentCookingStep = computed(() => {
  const steps = selectedRecipeSteps.value;
  if (steps.length === 0) {
    return null;
  }
  return steps[normalizedCookingStepIndex.value];
});

const hasCurrentStepTimer = computed(
  () => stepTimerTotalSeconds.value !== null && stepTimerTotalSeconds.value > 0
);

const stepTimerProgressRatio = computed(() => {
  if (!stepTimerTotalSeconds.value || stepTimerTotalSeconds.value <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, stepTimerRemainingSeconds.value / stepTimerTotalSeconds.value));
});

const stepTimerProgressDegrees = computed(
  () => `${Math.round(stepTimerProgressRatio.value * 360)}deg`
);

const stepTimerDisplay = computed(() =>
  hasCurrentStepTimer.value ? formatStepTimerClock(stepTimerRemainingSeconds.value) : ""
);

const stepTimerSuggestionLabel = computed(() =>
  hasCurrentStepTimer.value && stepTimerTotalSeconds.value !== null
    ? formatStepTimerDurationLabel(stepTimerTotalSeconds.value)
    : ""
);

const stepTimerActionLabel = computed(() => {
  if (stepTimerRunning.value) {
    return "Pause";
  }
  if (stepTimerFinished.value) {
    return "Relancer";
  }
  if (
    stepTimerTotalSeconds.value !== null &&
    stepTimerRemainingSeconds.value < stepTimerTotalSeconds.value
  ) {
    return "Reprendre";
  }
  return "Lancer";
});

const stepTimerActionIcon = computed(() => (stepTimerRunning.value ? "pi pi-pause" : "pi pi-play"));

const stepTimerResetDisabled = computed(() => {
  if (!hasCurrentStepTimer.value || stepTimerTotalSeconds.value === null) {
    return true;
  }
  return stepTimerRemainingSeconds.value === stepTimerTotalSeconds.value && !stepTimerFinished.value;
});

function clearCurrentCookingStepImageUrl(): void {
  if (currentCookingStepImageUrl.value) {
    URL.revokeObjectURL(currentCookingStepImageUrl.value);
    currentCookingStepImageUrl.value = null;
  }
}

function clearStepTimerInterval(): void {
  if (stepTimerIntervalId !== null) {
    clearInterval(stepTimerIntervalId);
    stepTimerIntervalId = null;
  }
  stepTimerRunning.value = false;
  stepTimerEndAt = 0;
}

function syncStepTimerFromClock(): void {
  if (!stepTimerRunning.value || stepTimerTotalSeconds.value === null || stepTimerEndAt <= 0) {
    return;
  }
  const remainingSeconds = Math.max(0, Math.ceil((stepTimerEndAt - Date.now()) / 1000));
  stepTimerRemainingSeconds.value = remainingSeconds;
  if (remainingSeconds > 0) {
    return;
  }
  clearStepTimerInterval();
  stepTimerFinished.value = true;
  playStepTimerFinishedSignal();
}

function applyStepTimerSuggestion(suggestedSeconds: number | undefined): void {
  clearStepTimerInterval();
  if (!suggestedSeconds) {
    stepTimerTotalSeconds.value = null;
    stepTimerRemainingSeconds.value = 0;
    stepTimerFinished.value = false;
    return;
  }
  stepTimerTotalSeconds.value = suggestedSeconds;
  stepTimerRemainingSeconds.value = suggestedSeconds;
  stepTimerFinished.value = false;
}

async function detectCurrentStepTimerSuggestion(): Promise<void> {
  const detectionId = ++stepTimerDetectionCounter;
  const step = currentCookingStep.value;
  if (cookingState.value === "OFF" || !step) {
    applyStepTimerSuggestion(undefined);
    return;
  }

  const stepText = step.text.trim();
  if (!stepText) {
    applyStepTimerSuggestion(undefined);
    return;
  }

  const localSuggestion = extractStepTimerDurationSeconds(stepText);
  applyStepTimerSuggestion(localSuggestion);

  const semanticSuggestion = await detectStepTimerDurationSeconds(stepText);
  if (detectionId !== stepTimerDetectionCounter) {
    return;
  }

  const activeStep = currentCookingStep.value;
  if (!activeStep || activeStep.id !== step.id) {
    return;
  }

  if (semanticSuggestion === localSuggestion) {
    return;
  }

  const timerUntouched =
    !stepTimerRunning.value &&
    !stepTimerFinished.value &&
    (stepTimerTotalSeconds.value === null ||
      stepTimerRemainingSeconds.value === stepTimerTotalSeconds.value);
  if (!timerUntouched) {
    return;
  }

  applyStepTimerSuggestion(semanticSuggestion);
}

function startStepTimer(): void {
  if (stepTimerTotalSeconds.value === null || stepTimerTotalSeconds.value <= 0 || stepTimerRunning.value) {
    return;
  }
  if (stepTimerRemainingSeconds.value <= 0) {
    stepTimerRemainingSeconds.value = stepTimerTotalSeconds.value;
  }
  stepTimerFinished.value = false;
  stepTimerRunning.value = true;
  stepTimerEndAt = Date.now() + stepTimerRemainingSeconds.value * 1000;
  syncStepTimerFromClock();
  if (!stepTimerRunning.value) {
    return;
  }
  stepTimerIntervalId = setInterval(syncStepTimerFromClock, 1000);
}

function pauseStepTimer(): void {
  if (!stepTimerRunning.value) {
    return;
  }
  syncStepTimerFromClock();
  clearStepTimerInterval();
}

function toggleStepTimer(): void {
  if (stepTimerRunning.value) {
    pauseStepTimer();
    return;
  }
  startStepTimer();
}

function resetStepTimer(): void {
  if (stepTimerTotalSeconds.value === null) {
    return;
  }
  clearStepTimerInterval();
  stepTimerRemainingSeconds.value = stepTimerTotalSeconds.value;
  stepTimerFinished.value = false;
}

async function loadCurrentCookingStepImage(): Promise<void> {
  const loadId = ++cookingStepImageLoadCounter;
  clearCurrentCookingStepImageUrl();

  const recipe = selectedRecipe.value;
  const step = currentCookingStep.value;
  if (cookingState.value === "OFF" || !recipe || !step) {
    return;
  }

  const stepText = step.text.trim();
  if (!stepText) {
    return;
  }

  const imageId = await resolveCookingStepImageId({
    recipeId: recipe.id,
    stepId: step.id,
    stepText
  });

  if (loadId !== cookingStepImageLoadCounter) {
    return;
  }

  if (!imageId) {
    return;
  }

  const blobUrl = await getCookingStepImageBlobUrl(imageId);
  if (loadId !== cookingStepImageLoadCounter) {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
    return;
  }

  currentCookingStepImageUrl.value = blobUrl ?? null;
}

const currentStepMentionedIngredients = computed(() => {
  const recipe = selectedRecipe.value;
  const step = currentCookingStep.value;
  if (!recipe || !step) {
    return [];
  }

  const normalizedStepText = normalizeForIngredientMatching(step.text);
  if (!normalizedStepText) {
    return [];
  }

  return [...recipe.ingredients]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((ingredient) => stepMentionsIngredient(normalizedStepText, ingredient.label));
});
const selectedRecipeIngredientsSorted = computed(() => {
  const recipe = selectedRecipe.value;
  if (!recipe?.ingredients.length) return [];
  return [...recipe.ingredients].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
});

/** Map step.id -> ingrédients mentionnés dans cette étape (pour zone préparation) */
const prepStepMentionedIngredients = computed(() => {
  const steps = selectedRecipeSteps.value;
  const ingredients = selectedRecipeIngredientsSorted.value;
  const map = new Map<string, IngredientLine[]>();
  for (const step of steps) {
    map.set(step.id, getMentionedIngredientsForStep(step, ingredients));
  }
  return map;
});

const selectedRecipeInstagramEmbedUrl = computed(() =>
  buildInstagramEmbedUrl(selectedRecipe.value?.source?.url)
);

const selectedRecipeYouTubeEmbedUrl = computed(() =>
  buildYouTubeEmbedUrl(selectedRecipe.value?.source?.url)
);

const formInstagramEmbedUrl = computed(() =>
  buildInstagramEmbedUrl(form.value.source?.url)
);

const formYouTubeEmbedUrl = computed(() =>
  buildYouTubeEmbedUrl(form.value.source?.url)
);

const activeFilters = computed<RecipeFilters>(() => ({
  category: categoryFilter.value === "ALL" ? undefined : categoryFilter.value,
  favorite: favoriteOnly.value ? true : undefined,
  search: search.value.trim() || undefined
}));

const canSaveForm = computed(() => {
  const candidate = formToRecipe(
    formMode.value === "EDIT" && formRecipeId.value
      ? recipes.value.find((recipe) => recipe.id === formRecipeId.value)
      : undefined
  );
  return isRecipeValidForSave(candidate);
});

const formSourceUrl = computed({
  get: () => form.value.source?.url ?? "",
  set: (v: string) => {
    const url = v?.trim() || undefined;
    if (url) {
      form.value.source = {
        type: form.value.source?.type ?? "URL",
        url,
        capturedAt: form.value.source?.capturedAt ?? new Date().toISOString()
      };
    } else if (form.value.source) {
      form.value.source = { ...form.value.source, url: undefined };
    }
  }
});

function openAddChoice(): void {
  clearMessages();
  pasteFieldContent.value = "";
  viewMode.value = "ADD_CHOICE";
}

function closeAddChoice(): void {
  clearMessages();
  pasteFieldContent.value = "";
  viewMode.value = "LIST";
}

function triggerFilePick(): void {
  fileInputRef.value?.click();
}

function isLikelyUrl(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
}

async function runImportFromSharePayload(payload: ShareImportPayload): Promise<void> {
  clearMessages();
  importBusy.value = true;
  importSourceType.value = "share";
  viewMode.value = "ADD_CHOICE";
  try {
    const draft = await bffImportService.importFromShare(payload);
    await createRecipeFromDraft(draft);
  } catch (error) {
    if (payload.url || payload.text) {
      pasteFieldContent.value = payload.url ?? payload.text ?? "";
    }
    setError(error);
  } finally {
    importBusy.value = false;
    importSourceType.value = null;
  }
}

async function importFromClipboardFallback(): Promise<void> {
  clearMessages();
  if (!navigator.clipboard?.readText) {
    setError(
      new Error("Lecture du presse-papiers non supportée ici. Collez manuellement dans le champ.")
    );
    return;
  }

  clipboardBusy.value = true;
  try {
    const content = (await navigator.clipboard.readText()).trim();
    if (!content) {
      throw new Error("Le presse-papiers est vide.");
    }
    pasteFieldContent.value = content;
    feedback.value = "Contenu du presse-papiers collé. Vous pouvez lancer l'import.";
  } catch (error) {
    setError(error);
  } finally {
    clipboardBusy.value = false;
  }
}

async function consumeShareTargetPayloadFromUrl(): Promise<void> {
  const payload = readShareImportPayloadFromWindow();
  if (!payload) {
    return;
  }

  // Clear query params early to avoid duplicate import on refresh/back navigation.
  clearShareImportParamsFromWindowLocation();
  await runImportFromSharePayload(payload);
}

async function runImportFromPasteField(): Promise<void> {
  const content = pasteFieldContent.value.trim();
  if (!content) {
    setError(new Error("Collez un lien ou du texte à importer."));
    return;
  }

  clearMessages();
  importBusy.value = true;
  importSourceType.value = isLikelyUrl(content) ? "url" : "text";
  try {
    let draft: ParsedRecipeDraft;
    if (importSourceType.value === "url") {
      draft = await bffImportService.importFromUrl(content);
    } else {
      draft = await bffImportService.importFromText(content);
    }
    pasteFieldContent.value = "";
    await createRecipeFromDraft(draft);
  } catch (error) {
    setError(error);
  } finally {
    importBusy.value = false;
    importSourceType.value = null;
  }
}

function onPasteInField(ev: ClipboardEvent): void {
  const data = ev.clipboardData;
  if (!data) return;

  const imageType = [...data.types].find((t) => t.startsWith("image/"));
  if (imageType) {
    ev.preventDefault();
    const file = data.files?.[0];
    if (file) {
      runImportFromFile(file);
    }
  }
}

async function runImportFromFile(file: File): Promise<void> {
  clearMessages();
  importBusy.value = true;
  const isImageFile = file.type.startsWith("image/");
  importSourceType.value = isImageFile ? "screenshot" : "file";
  try {
    let draft: ParsedRecipeDraft;
    if (isImageFile) {
      draft = await bffImportService.importFromScreenshot(file);
    } else {
      const text = await file.text();
      draft = await bffImportService.importFromText(text);
    }
    await createRecipeFromDraft(draft, isImageFile ? [file] : undefined);
  } catch (error) {
    setError(error);
  } finally {
    importBusy.value = false;
    importSourceType.value = null;
  }
}

async function runImportFromFiles(files: File[]): Promise<void> {
  if (files.length === 0) return;
  clearMessages();
  importBusy.value = true;
  importSourceType.value = "screenshot";
  try {
    const draft = await bffImportService.importFromScreenshots(files);
    await createRecipeFromDraft(draft, files);
  } catch (error) {
    setError(error);
  } finally {
    importBusy.value = false;
    importSourceType.value = null;
  }
}

async function runImportFromPasteFieldWithText(text: string): Promise<void> {
  clearMessages();
  importBusy.value = true;
  importSourceType.value = isLikelyUrl(text) ? "url" : "text";
  try {
    let draft: ParsedRecipeDraft;
    if (importSourceType.value === "url") {
      draft = await bffImportService.importFromUrl(text);
    } else {
      draft = await bffImportService.importFromText(text);
    }
    await createRecipeFromDraft(draft);
  } catch (error) {
    setError(error);
  } finally {
    importBusy.value = false;
    importSourceType.value = null;
  }
}

function onFilePicked(event: Event): void {
  const target = event.target as HTMLInputElement;
  const files = target.files ? [...target.files] : [];
  target.value = "";
  if (files.length === 0) return;

  const imageFiles = files.filter((f) => f.type.startsWith("image/"));
  const textFiles = files.filter(
    (f) =>
      f.type === "text/plain" ||
      f.type === "text/html" ||
      f.name.endsWith(".txt") ||
      f.name.endsWith(".html")
  );

  if (imageFiles.length > 0) {
    runImportFromFiles(imageFiles);
  } else if (textFiles.length > 0) {
    void textFiles[0].text().then((text) => {
      runImportFromPasteFieldWithText(text);
    });
  }
}

async function refresh(): Promise<void> {
  recipes.value = await dexieRecipeService.listRecipes(activeFilters.value);
  if (selectedRecipeId.value) {
    const exists = recipes.value.some((recipe) => recipe.id === selectedRecipeId.value);
    if (!exists) {
      selectedRecipeId.value = null;
      viewMode.value = "LIST";
    }
  }
}

watch(activeFilters, async () => {
  await refresh();
});

watch(selectedRecipeId, () => {
  cookingStepIndex.value = 0;
  showCookingIngredients.value = false;
});

watch(
  () => [
    cookingState.value,
    selectedRecipeId.value,
    currentCookingStep.value?.id,
    currentCookingStep.value?.text
  ],
  () => {
    void loadCurrentCookingStepImage();
  },
  { immediate: true }
);

watch(
  () => [
    cookingState.value,
    selectedRecipeId.value,
    currentCookingStep.value?.id,
    currentCookingStep.value?.text
  ],
  () => {
    if (cookingState.value === "OFF") {
      stepTimerDetectionCounter += 1;
      applyStepTimerSuggestion(undefined);
      return;
    }
    void detectCurrentStepTimerSuggestion();
  },
  { immediate: true }
);

watch(
  cookingState,
  (state) => {
    if (typeof document === "undefined") {
      return;
    }
    document.body.style.overflow = state !== "OFF" ? "hidden" : "";
  },
  { immediate: true }
);

function setError(error: unknown): void {
  errorMessage.value = error instanceof Error ? error.message : "Une erreur est survenue.";
  // eslint-disable-next-line no-console
  console.error(error);
}

function clearMessages(): void {
  feedback.value = "";
  feedbackType.value = "success";
  errorMessage.value = "";
}

function requestConfirmation(options: {
  header: string;
  message: string;
  acceptLabel: string;
  rejectLabel: string;
  acceptSeverity?: "primary" | "secondary" | "success" | "info" | "warn" | "help" | "danger" | "contrast";
}): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    confirm.require({
      group: "app-confirmation",
      header: options.header,
      message: options.message,
      icon: "pi pi-question-circle",
      accept: () => settle(true),
      reject: () => settle(false),
      onHide: () => settle(false),
      rejectProps: {
        label: options.rejectLabel,
        severity: "secondary",
        outlined: true
      },
      acceptProps: {
        label: options.acceptLabel,
        severity: options.acceptSeverity ?? "primary"
      }
    });
  });
}

function openCreateForm(): void {
  clearMessages();
  formMode.value = "CREATE";
  formRecipeId.value = null;
  form.value = emptyForm();
  viewMode.value = "FORM";
}

function openIngredientModal(ingredient: IngredientLine): void {
  selectedIngredientForModal.value = ingredient;
  ingredientModalVisible.value = true;
}

async function openEditForm(recipe: Recipe): Promise<void> {
  clearMessages();
  await stopCookingModeIfActive();
  formMode.value = "EDIT";
  formRecipeId.value = recipe.id;
  form.value = toForm(recipe);
  viewMode.value = "FORM";
}

function isMinimalFallbackDraft(draft: ParsedRecipeDraft): boolean {
  const hasIngredients = draft.ingredients.some((i) => (i.label ?? "").trim());
  const hasSteps = draft.steps.some((s) => (s.text ?? "").trim());
  return !hasIngredients && !hasSteps;
}

function fallbackImportMessage(source?: ImportSource): string {
  switch (source?.type) {
    case "SCREENSHOT":
      return "La lecture de l'image a échoué. Vérifiez que la photo est lisible, puis complétez manuellement si besoin.";
    case "TEXT":
      return "L'extraction du texte a échoué. Complétez manuellement la recette.";
    case "SHARE":
      return "L'extraction du partage a échoué. Complétez manuellement la recette.";
    case "URL":
      if (buildInstagramEmbedUrl(source.url)) {
        return "L'extraction du post Instagram est incomplète. Complétez manuellement la recette ; l'aperçu du post/reel reste affiché.";
      }
      return "L'extraction a échoué (site inaccessible ou rate limit). Complétez manuellement ou utilisez « Réextraire » si le lien est renseigné.";
    default:
      return "L'extraction a échoué. Complétez manuellement la recette.";
  }
}

async function createRecipeFromDraft(
  draft: ParsedRecipeDraft,
  screenshotFiles?: File[]
): Promise<void> {
  clearMessages();
  form.value = draftToForm(draft);
  let recipe = formToRecipe(undefined); // sans image, on la traite en async

  if (recipe.ingredients.length === 0 && recipe.steps.length === 0) {
    recipe = {
      ...recipe,
      steps: [{ id: randomId(), order: 1, text: "À compléter" }]
    };
  }

  if (
    draft.source?.type === "SCREENSHOT" &&
    screenshotFiles &&
    screenshotFiles.length > 0
  ) {
    const sourceImageIds: string[] = [];
    for (const file of screenshotFiles) {
      const id = await storeImageFromFile(file);
      if (id) sourceImageIds.push(id);
    }
    if (sourceImageIds.length > 0) {
      recipe = { ...recipe, sourceImageIds };
    }
    if (isMinimalFallbackDraft(draft) && sourceImageIds[0]) {
      recipe = { ...recipe, imageId: sourceImageIds[0] };
    }
  }

  await dexieRecipeService.createRecipe(recipe);
  selectedRecipeId.value = recipe.id;
  favoriteOnly.value = false;

  await refresh();

  if (isMinimalFallbackDraft(draft)) {
    formMode.value = "EDIT";
    formRecipeId.value = recipe.id;
    form.value = toForm(recipe);
    viewMode.value = "FORM";
    feedbackType.value = "warning";
    feedback.value = fallbackImportMessage(draft.source);
  } else {
    viewMode.value = "DETAIL";
    feedback.value = "Recette importée.";
    startAsyncImageForRecipe(recipe.id, draft);
  }
}

function startAsyncImageForRecipe(recipeId: string, draft: ParsedRecipeDraft): void {
  if (draft.imageUrl) {
    recipeIdWithPendingImage.value = recipeId;
    imageLoadingMessage.value = "Extraction de l'image...";
    storeImageFromUrl(draft.imageUrl)
      .then(async (imageId) => {
        if (imageId && selectedRecipeId.value === recipeId) {
          await dexieRecipeService.updateRecipe(recipeId, { imageId });
          await refresh();
        }
      })
      .finally(() => {
        if (recipeIdWithPendingImage.value === recipeId) {
          recipeIdWithPendingImage.value = null;
          imageLoadingMessage.value = "";
        }
      });
  } else if (draft.title?.trim()) {
    recipeIdWithPendingImage.value = recipeId;
    imageLoadingMessage.value = "Génération de l'image...";
    generateRecipeImage({
      title: draft.title,
      ingredients: draft.ingredients,
      steps: draft.steps
    })
      .then(async (imageUrl) => {
        if (imageUrl && selectedRecipeId.value === recipeId) {
          const imageId = await storeImageFromUrl(imageUrl);
          if (imageId) {
            await dexieRecipeService.updateRecipe(recipeId, { imageId });
            await refresh();
          }
        }
      })
      .finally(() => {
        if (recipeIdWithPendingImage.value === recipeId) {
          recipeIdWithPendingImage.value = null;
          imageLoadingMessage.value = "";
        }
      });
  }
}

function openDetail(recipe: Recipe): void {
  clearMessages();
  selectedRecipeId.value = recipe.id;
  cookingStepIndex.value = 0;
  showCookingIngredients.value = false;
  servingsInput.value = recipe.servingsCurrent
    ? String(recipe.servingsCurrent)
    : recipe.servingsBase
      ? String(recipe.servingsBase)
      : "";
  viewMode.value = "DETAIL";
}

async function backToList(): Promise<void> {
  clearMessages();
  if (viewMode.value === "DETAIL") {
    await stopCookingModeIfActive();
  }
  viewMode.value = "LIST";
  formRecipeId.value = null;
}

function addIngredient(): void {
  form.value.ingredients.push(emptyIngredient());
}

function removeIngredient(id: string): void {
  form.value.ingredients = form.value.ingredients.filter((ingredient) => ingredient.id !== id);
  if (form.value.ingredients.length === 0) {
    form.value.ingredients.push(emptyIngredient());
  }
}

function addStep(): void {
  form.value.steps.push(emptyStep());
}

function triggerFormImagePick(): void {
  formImageInputRef.value?.click();
}

async function onFormImagePicked(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (!file?.type.startsWith("image/")) return;
  const imageId = await storeImageFromFile(file);
  if (imageId) {
    form.value.imageId = imageId;
    form.value.imageUrl = undefined;
  }
}

function removeFormImage(): void {
  form.value.imageId = null;
  form.value.imageUrl = undefined;
}

function triggerImageGeneration(): void {
  if (!form.value.title?.trim()) return;
  const recipeId = formRecipeId.value;
  const isEdit = formMode.value === "EDIT" && recipeId;
  imageGenerating.value = true;

  generateRecipeImage({
    title: form.value.title,
    ingredients: form.value.ingredients.map((i) => ({ label: i.label })),
    steps: form.value.steps.map((s) => ({ text: s.text }))
  })
    .then(async (imageUrl) => {
      if (!imageUrl) return;
      if (viewMode.value === "FORM" && formRecipeId.value === recipeId) {
        form.value.imageUrl = imageUrl;
        form.value.imageId = null;
      } else if (isEdit) {
        const imageId = await storeImageFromUrl(imageUrl);
        if (imageId) {
          await dexieRecipeService.updateRecipe(recipeId, { imageId });
          await refresh();
        }
      }
    })
    .finally(() => {
      imageGenerating.value = false;
    });
}

async function triggerFullReextract(): Promise<void> {
  const url = form.value.source?.url?.trim();
  if (!url) return;
  imageReextracting.value = true;
  clearMessages();
  try {
    const draft = await bffImportService.importFromUrl(url);
    form.value = draftToForm(draft);
    feedback.value = "Recette réextraite depuis le lien.";
  } catch (err) {
    setError(err);
  } finally {
    imageReextracting.value = false;
  }
}

function removeStep(id: string): void {
  form.value.steps = form.value.steps.filter((step) => step.id !== id);
  if (form.value.steps.length === 0) {
    form.value.steps.push(emptyStep());
  }
}

function goToCookingStep(index: number): void {
  const totalSteps = selectedRecipeSteps.value.length;
  if (totalSteps === 0) {
    return;
  }
  cookingStepIndex.value = ((index % totalSteps) + totalSteps) % totalSteps;
}

function goToPreviousCookingStep(): void {
  goToCookingStep(normalizedCookingStepIndex.value - 1);
}

function goToNextCookingStep(): void {
  goToCookingStep(normalizedCookingStepIndex.value + 1);
}

function toggleCookingIngredientsVisibility(): void {
  showCookingIngredients.value = !showCookingIngredients.value;
}

function onCookingSliderTouchStart(event: TouchEvent): void {
  const firstTouch = event.touches[0];
  cookingSwipeStartX.value = firstTouch?.clientX ?? null;
}

function onCookingSliderTouchEnd(event: TouchEvent): void {
  if (cookingSwipeStartX.value === null) {
    return;
  }
  const firstTouch = event.changedTouches[0];
  const endX = firstTouch?.clientX;
  if (endX === undefined) {
    cookingSwipeStartX.value = null;
    return;
  }

  const deltaX = endX - cookingSwipeStartX.value;
  cookingSwipeStartX.value = null;
  if (Math.abs(deltaX) < 45) {
    return;
  }

  if (deltaX < 0) {
    goToNextCookingStep();
    return;
  }
  goToPreviousCookingStep();
}

async function saveForm(): Promise<void> {
  clearMessages();
  try {
    const existing =
      formMode.value === "EDIT" && formRecipeId.value
        ? recipes.value.find((recipe) => recipe.id === formRecipeId.value)
        : undefined;
    let recipe = formToRecipe(existing);

    if (!recipe.imageId && form.value.imageUrl) {
      const imageId = await storeImageFromUrl(form.value.imageUrl);
      if (imageId) {
        recipe = { ...recipe, imageId };
      }
    }

    if (existing) {
      if (existing.imageId && !recipe.imageId) {
        await db.images.delete(existing.imageId);
      }
      await dexieRecipeService.updateRecipe(existing.id, recipe);
      feedback.value = "Recette modifiée.";
      selectedRecipeId.value = existing.id;
    } else {
      await dexieRecipeService.createRecipe(recipe);
      feedback.value = "Recette créée.";
      selectedRecipeId.value = recipe.id;
      // Désactiver le filtre favoris pour que la nouvelle recette apparaisse
      favoriteOnly.value = false;
    }
    await refresh();
    viewMode.value = "DETAIL";
  } catch (error) {
    setError(error);
  }
}

async function deleteRecipe(recipe: Recipe): Promise<void> {
  clearMessages();
  const confirmed = await requestConfirmation({
    header: "Supprimer la recette",
    message: `Supprimer définitivement "${recipe.title}" ? Cette action est irréversible.`,
    acceptLabel: "Supprimer",
    rejectLabel: "Annuler",
    acceptSeverity: "danger"
  });
  if (!confirmed) {
    return;
  }

  try {
    await dexieRecipeService.deleteRecipe(recipe.id);
    await stopCookingModeIfActive();
    feedback.value = "Recette supprimée.";
    selectedRecipeId.value = null;
    viewMode.value = "LIST";
    await refresh();
  } catch (error) {
    setError(error);
  }
}

function formatRecipeTime(recipe: Recipe): string {
  const total =
    (recipe.prepTimeMin ?? 0) + (recipe.cookTimeMin ?? 0) + (recipe.restTimeMin ?? 0);
  if (total <= 0) return "";
  if (total < 60) return `${total}'`;
  const h = Math.floor(total / 60);
  const min = total % 60;
  return min > 0 ? `${h}h${String(min).padStart(2, "0")}` : `${h}h`;
}

function formatElapsedCookingTime(elapsedMilliseconds: number): string {
  const totalSeconds = Math.max(1, Math.round(elapsedMilliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${totalSeconds} s`;
  }
  if (seconds === 0) {
    return `${minutes} min`;
  }
  return `${minutes} min ${seconds} s`;
}

function buildCookingSessionTimingSummary(): CookingSessionTimingSummary | null {
  if (cookingModeStartedAt.value === null) {
    return null;
  }

  const elapsedMilliseconds = Math.max(0, Date.now() - cookingModeStartedAt.value);
  return {
    elapsedLabel: formatElapsedCookingTime(elapsedMilliseconds),
    measuredPrepTimeMin: Math.max(1, Math.round(elapsedMilliseconds / 60000)),
    recipeId: cookingModeRecipeId.value
  };
}

async function offerPrepTimeUpdateFromCookingSession(
  summary: CookingSessionTimingSummary
): Promise<void> {
  if (!summary.recipeId) {
    return;
  }

  const recipe = recipes.value.find((candidate) => candidate.id === summary.recipeId);
  if (!recipe) {
    return;
  }

  const currentPrepTime = recipe.prepTimeMin;
  if (currentPrepTime && currentPrepTime > 0) {
    const suggestedPrepTime = Math.max(
      1,
      Math.round((currentPrepTime + summary.measuredPrepTimeMin) / 2)
    );
    const shouldUpdate = await requestConfirmation({
      header: "Mettre à jour le temps de préparation",
      message:
        `Vous avez cuisiné pendant ${summary.elapsedLabel}. ` +
        `Temps actuel: ${currentPrepTime} min. ` +
        `Temps mesuré: ${summary.measuredPrepTimeMin} min. ` +
        `Mettre à jour à ${suggestedPrepTime} min (moyenne) ?`,
      acceptLabel: "Mettre à jour",
      rejectLabel: "Plus tard"
    });

    if (!shouldUpdate) {
      return;
    }

    await dexieRecipeService.updateRecipe(recipe.id, { prepTimeMin: suggestedPrepTime });
    await refresh();
    feedback.value =
      `Mode cuisine désactivé. Temps passé : ${summary.elapsedLabel}. ` +
      `Temps de préparation mis à jour à ${suggestedPrepTime} min (moyenne).`;
    return;
  }

  const shouldInitialize = await requestConfirmation({
    header: "Enregistrer un temps de préparation",
    message:
      `Vous avez cuisiné pendant ${summary.elapsedLabel}. ` +
      "Aucun temps de préparation n'est enregistré. " +
      `Enregistrer ${summary.measuredPrepTimeMin} min ?`,
    acceptLabel: "Enregistrer",
    rejectLabel: "Plus tard"
  });
  if (!shouldInitialize) {
    return;
  }

  await dexieRecipeService.updateRecipe(recipe.id, {
    prepTimeMin: summary.measuredPrepTimeMin
  });
  await refresh();
  feedback.value =
    `Mode cuisine désactivé. Temps passé : ${summary.elapsedLabel}. ` +
    `Temps de préparation mis à jour à ${summary.measuredPrepTimeMin} min.`;
}

function ingredientPreviewForCard(
  recipe: Recipe
): Array<{ key: string; label: string; imageId?: string }> {
  const previews: Array<{ key: string; label: string; imageId?: string }> = [];
  const seen = new Set<string>();
  const sorted = [...recipe.ingredients].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const ingredient of sorted) {
    const label = ingredient.label.trim();
    if (!label) {
      continue;
    }

    const dedupeKey = ingredient.imageId?.trim() || label.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    previews.push({
      key: dedupeKey,
      label,
      imageId: ingredient.imageId
    });

    if (previews.length >= 4) {
      break;
    }
  }

  return previews;
}

async function toggleFavorite(recipe: Recipe): Promise<void> {
  clearMessages();
  try {
    await dexieRecipeService.toggleFavorite(recipe.id);
    await refresh();
  } catch (error) {
    setError(error);
  }
}

async function scaleToInput(recipe: Recipe): Promise<void> {
  clearMessages();
  const target = parseNumber(servingsInput.value);
  if (!target) {
    setError(new Error("Nombre de portions invalide."));
    return;
  }

  try {
    const updated = await dexieRecipeService.scaleRecipe(recipe.id, target);
    servingsInput.value = String(updated.servingsCurrent ?? target);
    await refresh();
    selectedRecipeId.value = recipe.id;
  } catch (error) {
    setError(error);
  }
}

async function decrementServings(recipe: Recipe): Promise<void> {
  const n = parseNumber(servingsInput.value);
  if (!n || n <= 1) return;
  servingsInput.value = String(n - 1);
  await scaleToInput(recipe);
}

async function incrementServings(recipe: Recipe): Promise<void> {
  const n = parseNumber(servingsInput.value) ?? 0;
  servingsInput.value = String(n + 1);
  await scaleToInput(recipe);
}

async function stopCookingModeIfActive(
  options?: { offerPrepTimeUpdate?: boolean }
): Promise<void> {
  if (cookingState.value === "OFF") {
    return;
  }

  const timingSummary = buildCookingSessionTimingSummary();
  try {
    await browserCookingModeService.stopCookingMode();
    cookingState.value = "OFF";
    showCookingIngredients.value = false;
    cookingModeStartedAt.value = null;
    cookingModeRecipeId.value = null;

    feedback.value = timingSummary
      ? `Mode cuisine désactivé. Temps passé : ${timingSummary.elapsedLabel}.`
      : "Mode cuisine désactivé.";

    if ((options?.offerPrepTimeUpdate ?? true) && timingSummary) {
      await offerPrepTimeUpdateFromCookingSession(timingSummary);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("stopCookingMode failed", error);
  }
}

async function toggleCookingMode(): Promise<void> {
  clearMessages();
  try {
    if (cookingState.value === "OFF") {
      cookingStepIndex.value = 0;
      showCookingIngredients.value = false;
      const session = await browserCookingModeService.startCookingMode();
      cookingState.value = session.strategy;
      cookingModeStartedAt.value = Date.now();
      cookingModeRecipeId.value = selectedRecipeId.value;
      feedback.value =
        session.strategy === "WAKE_LOCK"
          ? "Mode cuisine actif (Wake Lock)."
          : "Mode cuisine actif (fallback navigateur).";
      return;
    }

    await stopCookingModeIfActive({ offerPrepTimeUpdate: true });
  } catch (error) {
    setError(error);
  }
}

onMounted(async () => {
  await seedIfEmpty();
  await refresh();
  await consumeShareTargetPayloadFromUrl();
});

onUnmounted(() => {
  stepTimerDetectionCounter += 1;
  clearStepTimerInterval();
  cookingStepImageLoadCounter += 1;
  clearCurrentCookingStepImageUrl();
  if (typeof document !== "undefined") {
    document.body.style.overflow = "";
  }
});
</script>

<template>
  <main class="app-shell">
    <ConfirmDialog group="app-confirmation" />
    <Dialog
      v-model:visible="recipeImageFullscreenVisible"
      modal
      :header="undefined"
      :closable="true"
      :dismissable-mask="true"
      :style="{ width: '95vw', maxWidth: '900px' }"
      :content-style="{ padding: 0, overflow: 'hidden' }"
      class="recipe-image-fullscreen-dialog"
    >
      <div v-if="recipeImageFullscreenId" class="recipe-image-fullscreen-content">
        <RecipeImage
          :image-id="recipeImageFullscreenId"
          alt="Image de la recette en plein écran"
          img-class="recipe-image-fullscreen-img"
        />
      </div>
    </Dialog>
    <section v-if="errorMessage" class="message error">{{ errorMessage }}</section>
    <section v-else-if="feedback" :class="['message', feedbackType === 'warning' ? 'warning' : 'success']">{{ feedback }}</section>

    <section v-if="viewMode === 'LIST'" class="list-view">
      <div class="toolbar">
        <div class="filters">
          <div class="filters-inner">
            <div class="toolbar-search-row" :class="{ 'search-expanded': searchExpanded }">
              <input
                ref="searchInputRef"
                id="search"
                v-model="search"
                type="search"
                placeholder="Rechercher..."
                class="search-input"
              />
            </div>
            <div class="filter-chips">
            <Button
              class="search-toggle-btn"
              icon="pi pi-search"
              severity="secondary"
              size="small"
              rounded
              aria-label="Rechercher"
              @click="toggleSearchExpanded"
            />
            <Button
              :severity="favoriteOnly ? 'primary' : 'secondary'"
              size="small"
              icon="pi pi-heart"
              rounded
              aria-label="Favoris"
              @click="favoriteOnly = !favoriteOnly"
            />
            <Button
              :severity="categoryFilter === 'SUCRE' ? 'primary' : 'secondary'"
              label="Sucré"
              size="small"
              @click="categoryFilter = categoryFilter === 'SUCRE' ? 'ALL' : 'SUCRE'"
            />
            <Button
              :severity="categoryFilter === 'SALE' ? 'primary' : 'secondary'"
              label="Salé"
              size="small"
              @click="categoryFilter = categoryFilter === 'SALE' ? 'ALL' : 'SALE'"
            />
            </div>
          </div>
        </div>
        <div class="toolbar-actions">
          <Button
            label="Nouvelle recette"
            icon="pi pi-plus"
            rounded
            :loading="importBusy"
            @click="openAddChoice"
          />
        </div>
      </div>

      <section class="grid">
        <Card
          v-for="recipe in recipes"
          :key="recipe.id"
          class="recipe-card"
          @click="openDetail(recipe)"
        >
          <template #header>
            <div class="recipe-card-header">
              <RecipeImage
                v-if="recipe.imageId"
                :image-id="recipe.imageId"
                img-class="recipe-card-image"
              />
              <div v-else class="recipe-card-image-placeholder" />
              <button
                type="button"
                :class="['recipe-card-favorite', { 'recipe-card-favorite--active': recipe.favorite }]"
                :aria-label="recipe.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
                @click.stop="toggleFavorite(recipe)"
              >
                <i :class="recipe.favorite ? 'pi pi-heart-fill' : 'pi pi-heart'" />
              </button>
            </div>
          </template>
          <template #title>{{ recipe.title }}</template>
          <template #subtitle>
            <span v-if="formatRecipeTime(recipe)" class="recipe-card-time">
              <i class="pi pi-stopwatch recipe-card-time-icon" aria-hidden="true" />
              {{ formatRecipeTime(recipe) }}
            </span>
          </template>
          <template #content>
            <div class="recipe-card-content">
              <p class="recipe-card-meta">
                {{ recipe.ingredients.length }} ingrédients · {{ recipe.steps.length }} étapes
              </p>
              <div class="recipe-card-ingredient-icons" aria-hidden="true">
                <IngredientImage
                  v-for="ingredientPreview in ingredientPreviewForCard(recipe)"
                  :key="ingredientPreview.key"
                  :label="ingredientPreview.label"
                  :image-id="ingredientPreview.imageId"
                  img-class="ingredient-icon ingredient-icon--card"
                  fallback-class="ingredient-icon ingredient-icon--card"
                  :alt="`Ingrédient ${ingredientPreview.label}`"
                />
              </div>
            </div>
          </template>
        </Card>

        <Card v-if="recipes.length === 0" class="recipe-card empty-card">
          <template #title>Aucune recette</template>
          <template #content>
            <p>Cliquez sur « Nouvelle recette » pour saisir à la main ou importer (coller / fichier).</p>
          </template>
        </Card>
      </section>
    </section>

    <section v-else-if="viewMode === 'ADD_CHOICE'" class="panel add-choice-panel">
      <div class="row between">
        <h2>Nouvelle recette</h2>
        <Button label="Annuler" text icon="pi pi-times" @click="closeAddChoice" />
      </div>

      <div
        v-if="importBusy"
        class="import-analyzing"
        aria-live="polite"
      >
        <ProgressSpinner style="width: 2.5rem; height: 2.5rem" strokeWidth="4" />
        <p>{{ importBusyLabel(importSourceType) }}</p>
      </div>

      <div class="stack">
        <label for="paste-field">Coller</label>
        <textarea
          id="paste-field"
          v-model="pasteFieldContent"
          class="paste-field"
          rows="4"
          placeholder="Lien, texte ou image"
          @paste="onPasteInField"
        />
      </div>

      <div class="add-choice-buttons">
        <Button
          label="Importer"
          icon="pi pi-download"
          :disabled="importBusy || clipboardBusy || !pasteFieldContent.trim()"
          @click="runImportFromPasteField"
        />
        <Button
          label="Coller depuis le presse-papiers"
          icon="pi pi-clipboard"
          :loading="clipboardBusy"
          :disabled="importBusy"
          @click="importFromClipboardFallback"
        />
        <Button
          label="Saisir à la main"
          icon="pi pi-pencil"
          @click="openCreateForm"
        />
        <Button
          label="Choisir des images"
          icon="pi pi-image"
          :disabled="importBusy"
          @click="triggerFilePick"
        />
      </div>

      <input
        ref="fileInputRef"
        type="file"
        accept="image/*,.txt,text/plain,text/html"
        multiple
        class="hidden-file-input"
        @change="onFilePicked"
      />
    </section>

    <section v-else-if="viewMode === 'DETAIL' && selectedRecipe" class="panel detail">
      <Teleport v-if="cookingState !== 'OFF'" to="body">
        <div
          class="cooking-fullscreen-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Mode cuisine plein écran"
          @touchstart.passive="onCookingSliderTouchStart"
          @touchend.passive="onCookingSliderTouchEnd"
        >
          <div class="cooking-fullscreen-header">
            <div class="cooking-fullscreen-title-block">
              <p class="cooking-fullscreen-title">{{ selectedRecipe.title }}</p>
              <p v-if="currentCookingStep" class="cooking-step-status">
                Étape {{ normalizedCookingStepIndex + 1 }} / {{ selectedRecipeSteps.length }}
              </p>
            </div>
            <Button
              text
              icon="pi pi-times"
              aria-label="Quitter le mode cuisine"
              class="cooking-fullscreen-close"
              @click="toggleCookingMode"
            />
          </div>

          <div
            class="cooking-fullscreen-media-zone"
            :class="{ 'cooking-fullscreen-media-zone--with-timer': hasCurrentStepTimer }"
          >
            <img
              v-if="currentCookingStepImageUrl"
              :src="currentCookingStepImageUrl"
              alt="Illustration de l'étape"
              class="cooking-fullscreen-media-image"
            />
            <RecipeImage
              v-else-if="selectedRecipe.imageId"
              :image-id="selectedRecipe.imageId"
              img-class="cooking-fullscreen-media-image"
            />
            <div v-else class="cooking-fullscreen-media-placeholder">
              <p>Ajoutez une image pour avoir un repère visuel pendant la cuisine.</p>
              <Button
                text
                size="small"
                icon="pi pi-image"
                label="Ajouter une image"
                @click="openEditForm(selectedRecipe)"
              />
            </div>

            <section
              v-if="hasCurrentStepTimer"
              class="cooking-step-timer"
              :aria-label="`Timer suggéré: ${stepTimerSuggestionLabel}`"
            >
              <div
                class="cooking-step-timer-visual"
                :style="{ '--timer-progress': stepTimerProgressDegrees }"
              >
                <p class="cooking-step-timer-time">{{ stepTimerDisplay }}</p>
              </div>
              <p class="cooking-step-timer-label">
                {{ stepTimerFinished ? "Timer terminé" : `Timer suggéré: ${stepTimerSuggestionLabel}` }}
              </p>
              <div class="cooking-step-timer-actions">
                <Button
                  size="small"
                  rounded
                  class="cooking-step-timer-action cooking-step-timer-action--primary"
                  :icon="stepTimerActionIcon"
                  :aria-label="stepTimerActionLabel"
                  :title="stepTimerActionLabel"
                  @click="toggleStepTimer"
                />
                <Button
                  text
                  size="small"
                  rounded
                  class="cooking-step-timer-action cooking-step-timer-action--reset"
                  icon="pi pi-refresh"
                  aria-label="Réinitialiser le timer"
                  title="Réinitialiser"
                  :disabled="stepTimerResetDisabled"
                  @click="resetStepTimer"
                />
              </div>
            </section>
          </div>

          <template v-if="currentCookingStep">
            <div class="cooking-step-body">
              <div class="cooking-step-text-scroll">
                <p class="cooking-step-text cooking-step-text--fullscreen">{{ currentCookingStep.text }}</p>
              </div>
              <div class="cooking-step-ingredients-row" aria-label="Ingrédients mentionnés dans l'étape">
                <div class="cooking-step-ingredients-icons">
                  <StepMentionedIngredientIcons
                    v-if="currentStepMentionedIngredients.length > 0"
                    :ingredients="currentStepMentionedIngredients"
                    :refresh-key="ingredientImageRefreshKey"
                    variant="cooking"
                    @detail="openIngredientModal($event)"
                  />
                </div>
                <button
                  type="button"
                  class="cooking-step-see-all"
                  :aria-expanded="showCookingIngredients"
                  @click="toggleCookingIngredientsVisibility"
                >
                  {{ showCookingIngredients ? "Masquer" : "Voir tous" }}
                </button>
              </div>
              <div v-if="showCookingIngredients" class="cooking-fullscreen-all-ingredients">
                <div class="ingredient-grid">
                  <button
                    v-for="ingredient in selectedRecipeIngredientsSorted"
                    :key="ingredient.id"
                    type="button"
                    class="ingredient-card"
                    :aria-label="`Voir les détails de ${ingredient.label}`"
                    @click="openIngredientModal(ingredient)"
                    @keydown.enter="openIngredientModal(ingredient)"
                    @keydown.space.prevent="openIngredientModal(ingredient)"
                  >
                    <div class="ingredient-card-image-wrap">
                      <IngredientImage
                        :label="ingredient.label"
                        :image-id="ingredient.imageId"
                        :refresh-key="ingredientImageRefreshKey"
                        img-class="ingredient-card-img"
                        fallback-class="ingredient-card-img-fallback"
                        :alt="`Ingrédient ${ingredient.label}`"
                      />
                    </div>
                    <span class="ingredient-card-name">{{ ingredient.label }}</span>
                    <span v-if="ingredient.quantity !== undefined" class="ingredient-card-qty">
                      {{ ingredient.quantity }} {{ ingredient.unit ?? "" }}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div class="cooking-step-footer">
              <div class="cooking-step-navigation" role="group" aria-label="Navigation des étapes">
                <Button
                  icon="pi pi-chevron-left"
                  label="Précédente"
                  class="cooking-step-nav"
                  @click="goToPreviousCookingStep"
                />
                <Button
                  icon="pi pi-chevron-right"
                  iconPos="right"
                  label="Suivante"
                  class="cooking-step-nav"
                  @click="goToNextCookingStep"
                />
              </div>
              <div
                v-if="selectedRecipeSteps.length > 1"
                class="cooking-step-dots"
                role="tablist"
                aria-label="Accès direct aux étapes"
              >
                <button
                  v-for="(step, index) in selectedRecipeSteps"
                  :key="step.id"
                  type="button"
                  :class="['cooking-step-dot', { 'cooking-step-dot--active': index === normalizedCookingStepIndex }]"
                  :aria-label="`Aller à l'étape ${index + 1}`"
                  :aria-current="index === normalizedCookingStepIndex ? 'step' : undefined"
                  @click="goToCookingStep(index)"
                />
              </div>
            </div>
          </template>
          <p v-else class="muted">Aucune étape à afficher pour cette recette.</p>
        </div>
      </Teleport>

      <div class="recipe-detail-header">
        <div v-if="selectedRecipeYouTubeEmbedUrl" class="recipe-detail-embed-wrapper">
          <iframe
            :src="selectedRecipeYouTubeEmbedUrl"
            title="Aperçu vidéo YouTube"
            class="recipe-detail-youtube-embed"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          />
        </div>
        <div v-else-if="selectedRecipeInstagramEmbedUrl" class="recipe-detail-embed-wrapper">
          <iframe
            :src="selectedRecipeInstagramEmbedUrl"
            title="Aperçu Instagram"
            class="recipe-detail-instagram-embed"
            loading="lazy"
            allow="clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share"
            allowfullscreen
          />
        </div>
        <button
          v-else-if="selectedRecipe.imageId"
          type="button"
          class="recipe-detail-image-button"
          :aria-label="'Voir l\'image en plein écran'"
          @click="recipeImageFullscreenId = selectedRecipe.imageId ?? null"
        >
          <RecipeImage
            :image-id="selectedRecipe.imageId"
            img-class="recipe-detail-image"
          />
          <span class="recipe-detail-image-expand-hint">
            <i class="pi pi-search-plus" aria-hidden="true" />
          </span>
        </button>
        <div
          v-else-if="selectedRecipe.id === recipeIdWithPendingImage"
          class="recipe-detail-image-placeholder recipe-detail-image-placeholder--loading"
        >
          {{ imageLoadingMessage }}
        </div>
        <div v-else class="recipe-detail-image-placeholder" />
        <button
          v-if="!selectedRecipeYouTubeEmbedUrl && !selectedRecipeInstagramEmbedUrl"
          type="button"
          class="recipe-detail-play-overlay"
          :aria-label="cookingState === 'OFF' ? 'Cuisiner' : 'Désactiver le mode cuisine'"
          :title="cookingState === 'OFF' ? 'Cuisiner' : 'Quitter le mode cuisine'"
          @click="toggleCookingMode"
        >
          <i :class="cookingState === 'OFF' ? 'pi pi-play' : 'pi pi-sun'" />
          <span class="recipe-detail-play-overlay-label">{{ cookingState === 'OFF' ? 'Cuisiner' : 'Mode cuisine actif' }}</span>
        </button>
        <div class="recipe-detail-header-actions">
          <Button
            text
            icon="pi pi-arrow-left"
            class="recipe-detail-back"
            aria-label="Retour"
            @click="backToList"
          />
          <button
            type="button"
            :class="['recipe-detail-favorite', { 'recipe-detail-favorite--active': selectedRecipe.favorite }]"
            :aria-label="selectedRecipe.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
            @click="toggleFavorite(selectedRecipe)"
          >
            <i :class="selectedRecipe.favorite ? 'pi pi-heart-fill' : 'pi pi-heart'" />
          </button>
        </div>
      </div>
      <div class="recipe-detail-meta">
        <h2 class="recipe-detail-title">{{ selectedRecipe.title }}</h2>
        <div class="recipe-detail-actions" role="group" aria-label="Actions de la recette">
          <Button
            label="Éditer"
            text
            icon="pi pi-pencil"
            size="small"
            class="recipe-detail-action"
            aria-label="Éditer la recette"
            @click="openEditForm(selectedRecipe)"
          />
          <Button
            severity="danger"
            text
            size="small"
            icon="pi pi-trash"
            label="Supprimer"
            class="recipe-detail-action"
            aria-label="Supprimer la recette"
            @click="deleteRecipe(selectedRecipe)"
          />
          <a
            v-if="selectedRecipe.source?.url"
            :href="selectedRecipe.source.url"
            target="_blank"
            rel="noopener"
            class="recipe-detail-action-link"
            aria-label="Voir la recette originale"
          >
            <i class="pi pi-external-link" />
            <span class="recipe-detail-action-label">Source</span>
          </a>
        </div>
      </div>

      <div v-if="selectedRecipe.source?.type === 'SCREENSHOT' && selectedRecipe.sourceImageIds?.length" class="source-images-section">
        <p class="source-images-label">
          <i class="pi pi-images" />
          Images sources importées
        </p>
        <div class="source-images-thumbnails">
          <button
            v-for="(imgId, idx) in selectedRecipe.sourceImageIds"
            :key="imgId"
            type="button"
            class="source-image-thumb"
            :aria-label="`Voir l'image source ${idx + 1} en grand`"
            @click="recipeImageFullscreenId = imgId"
          >
            <RecipeImage
              :image-id="imgId"
              :alt="`Source ${idx + 1}`"
              img-class="source-image-thumb-img"
            />
          </button>
        </div>
      </div>
      <p v-else-if="selectedRecipe.source && !selectedRecipe.source.url" class="source-hint">
        <i class="pi pi-paperclip" />
        Source : {{ sourceTypeLabel(selectedRecipe.source) }}
      </p>

      <!-- Portions UI (slice K) : visible si la recette a un servingsBase -->
      <div v-if="FEATURE_PORTIONS_ENABLED && selectedRecipe.servingsBase" class="servings-tools">
        <label for="servings-input">Portions</label>
        <div class="servings-stepper">
          <button
            type="button"
            class="servings-stepper-btn"
            aria-label="Diminuer le nombre de portions"
            :disabled="!(parseNumber(servingsInput) ?? 0) || (parseNumber(servingsInput) ?? 0) <= 1"
            @click="selectedRecipe && decrementServings(selectedRecipe)"
          >
            −
          </button>
          <input
            id="servings-input"
            v-model="servingsInput"
            type="number"
            min="1"
            step="1"
            class="servings-stepper-input"
            aria-label="Nombre de portions"
            @change="selectedRecipe && scaleToInput(selectedRecipe)"
          />
          <button
            type="button"
            class="servings-stepper-btn"
            aria-label="Augmenter le nombre de portions"
            @click="selectedRecipe && incrementServings(selectedRecipe)"
          >
            +
          </button>
        </div>
      </div>

      <h3>Ingrédients</h3>
      <div class="ingredient-grid">
        <button
          v-for="ingredient in selectedRecipeIngredientsSorted"
          :key="ingredient.id"
          type="button"
          class="ingredient-card"
          :aria-label="`Voir les détails de ${ingredient.label}`"
          @click="openIngredientModal(ingredient)"
          @keydown.enter="openIngredientModal(ingredient)"
          @keydown.space.prevent="openIngredientModal(ingredient)"
        >
          <div class="ingredient-card-image-wrap">
            <IngredientImage
              :label="ingredient.label"
              :image-id="ingredient.imageId"
              :refresh-key="ingredientImageRefreshKey"
              img-class="ingredient-card-img"
              fallback-class="ingredient-card-img-fallback"
              :alt="`Ingrédient ${ingredient.label}`"
            />
          </div>
          <span class="ingredient-card-name">{{ ingredient.label }}</span>
          <span v-if="ingredient.quantity !== undefined" class="ingredient-card-qty">
            {{ ingredient.quantity }} {{ ingredient.unit ?? "" }}
          </span>
        </button>
      </div>
      <IngredientDetailModal
        v-model:visible="ingredientModalVisible"
        :ingredient="selectedIngredientForModal"
        :recipe="selectedRecipe"
        :refresh-key="ingredientImageRefreshKey"
        @image-updated="ingredientImageRefreshKey++"
      />

      <h3>Préparation</h3>
      <div class="recipe-time-encart">
        <div
          v-if="
            (selectedRecipe?.prepTimeMin ?? 0) +
              (selectedRecipe?.cookTimeMin ?? 0) +
              (selectedRecipe?.restTimeMin ?? 0) >
            0
          "
          class="recipe-time-content"
        >
          <div class="recipe-time-total">
            Temps total :
            {{
              formatRecipeTime(selectedRecipe!)
            }}
          </div>
          <div class="recipe-time-breakdown">
            <span v-if="selectedRecipe?.prepTimeMin" class="recipe-time-col">
              Préparation : {{ selectedRecipe.prepTimeMin }} min
            </span>
            <span v-if="selectedRecipe?.restTimeMin" class="recipe-time-col">
              Repos : {{ selectedRecipe.restTimeMin }} min
            </span>
            <span v-if="selectedRecipe?.cookTimeMin" class="recipe-time-col">
              Cuisson : {{ selectedRecipe.cookTimeMin }} min
            </span>
          </div>
        </div>
        <Button
          :icon="cookingState === 'OFF' ? 'pi pi-play' : 'pi pi-sun'"
          :label="cookingState === 'OFF' ? 'Cuisiner' : 'Quitter le mode cuisine'"
          class="recipe-detail-cuisiner-primary"
          size="large"
          :severity="cookingState === 'OFF' ? 'primary' : 'secondary'"
          aria-label="Activer ou désactiver le mode cuisine"
          @click="toggleCookingMode"
        />
      </div>
      <ol class="prep-steps-list">
        <li
          v-for="(step, stepIndex) in selectedRecipeSteps"
          :key="step.id"
          class="prep-step"
        >
          <div class="prep-step-row">
            <div class="prep-step-content">
              <strong class="prep-step-num">Étape {{ stepIndex + 1 }}</strong>
              <span class="prep-step-text">{{ step.text }}</span>
            </div>
            <div
              v-if="(prepStepMentionedIngredients.get(step.id) ?? []).length"
              class="prep-step-ingredients"
              aria-label="Ingrédients pour cette étape"
            >
              <StepMentionedIngredientIcons
                :ingredients="prepStepMentionedIngredients.get(step.id) ?? []"
                :refresh-key="ingredientImageRefreshKey"
                variant="prep"
                @detail="openIngredientModal($event)"
              />
            </div>
          </div>
        </li>
      </ol>
    </section>

    <section v-else-if="viewMode === 'FORM'" class="panel form-panel">
      <div class="row between form-header-row">
        <h2>
          {{ formMode === "EDIT" ? "Éditer recette" : "Nouvelle recette" }}
        </h2>
        <div class="row form-header-actions">
          <Button label="Annuler" text icon="pi pi-times" @click="backToList" />
          <Button
            label="Enregistrer"
            icon="pi pi-check"
            :disabled="!canSaveForm"
            @click="saveForm"
          />
        </div>
      </div>

      <div class="stack">
        <label for="title">Titre</label>
        <input id="title" v-model="form.title" type="text" placeholder="Ex: Cookies noisette" />
      </div>

      <div class="stack">
        <label for="source-url">Source</label>
        <div class="row source-input-row">
          <input
            id="source-url"
            v-model="formSourceUrl"
            type="url"
            placeholder="https://..."
            class="source-input"
          />
          <Button
            v-if="form.source?.url"
            text
            size="small"
            icon="pi pi-refresh"
            :aria-label="'Réextraire la recette'"
            :loading="imageReextracting"
            @click="triggerFullReextract"
          />
        </div>
        <small
          v-if="form.source && !form.source.url && !(form.source.type === 'SCREENSHOT' && formRecipeSourceImageIds.length)"
          class="muted"
        >
          Source import : {{ sourceTypeLabel(form.source) }}
        </small>
        <div
          v-if="form.source?.type === 'SCREENSHOT' && formRecipeSourceImageIds.length"
          class="source-images-thumbnails source-images-thumbnails--form"
        >
          <button
            v-for="(imgId, idx) in formRecipeSourceImageIds"
            :key="imgId"
            type="button"
            class="source-image-thumb"
            :aria-label="`Voir l'image source ${idx + 1} en grand`"
            @click="recipeImageFullscreenId = imgId"
          >
            <RecipeImage
              :image-id="imgId"
              :alt="`Source ${idx + 1}`"
              img-class="source-image-thumb-img"
            />
          </button>
        </div>
      </div>

      <div class="stack">
        <div v-if="formYouTubeEmbedUrl" class="recipe-form-embed-wrapper">
          <iframe
            :src="formYouTubeEmbedUrl"
            title="Aperçu vidéo YouTube"
            class="recipe-form-youtube-embed"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          />
          <small class="muted">Aperçu de la vidéo YouTube importée.</small>
        </div>
        <div v-else-if="formInstagramEmbedUrl" class="recipe-form-embed-wrapper">
          <iframe
            :src="formInstagramEmbedUrl"
            title="Aperçu Instagram"
            class="recipe-form-instagram-embed"
            loading="lazy"
            allow="clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share"
            allowfullscreen
          />
          <small class="muted">Aperçu du post/reel Instagram importé.</small>
        </div>
        <div v-else-if="form.imageUrl || (form.imageId && typeof form.imageId === 'string')" class="row recipe-form-image-row">
          <RecipeImage
            v-if="form.imageId && typeof form.imageId === 'string'"
            :image-id="form.imageId"
            img-class="recipe-form-image"
          />
          <img
            v-else-if="form.imageUrl"
            :src="form.imageUrl"
            alt="Aperçu import"
            class="recipe-form-image"
          />
          <div class="row recipe-form-image-actions">
            <Button
              text
              size="small"
              icon="pi pi-upload"
              label="Changer"
              @click="triggerFormImagePick"
            />
            <Button
              text
              size="small"
              icon="pi pi-sparkles"
              label="Générer"
              :loading="imageGenerating"
              @click="triggerImageGeneration"
            />
            <Button
              text
              size="small"
              severity="secondary"
              icon="pi pi-times"
              label="Supprimer"
              @click="removeFormImage"
            />
          </div>
        </div>
        <div v-else-if="imageGenerating || imageReextracting" class="recipe-form-image-placeholder">
          <ProgressSpinner style="width: 2rem; height: 2rem" strokeWidth="4" />
          <span>{{ imageReextracting ? "Extraction de la recette en cours…" : "Génération de l'image en cours…" }}</span>
        </div>
        <div v-else class="stack recipe-form-media-fallback">
          <div class="row" style="gap: 0.5rem; flex-wrap: wrap">
            <Button
              text
              size="small"
              icon="pi pi-image"
              label="Ajouter une image"
              @click="triggerFormImagePick"
            />
            <Button
              text
              size="small"
              icon="pi pi-sparkles"
              label="Générer une image"
              :loading="imageGenerating"
              @click="triggerImageGeneration"
            />
          </div>
        </div>
        <input
          ref="formImageInputRef"
          type="file"
          accept="image/*"
          class="hidden-file-input"
          @change="onFormImagePicked"
        />
      </div>

      <div class="row form-row-category-portions">
        <div class="stack">
          <div class="row category-radios">
            <label class="radio-line">
              <input v-model="form.category" type="radio" value="SUCRE" />
              Sucré
            </label>
            <label class="radio-line">
              <input v-model="form.category" type="radio" value="SALE" />
              Salé
            </label>
          </div>
        </div>
        <div class="stack">
          <label for="servingsBase">Portions</label>
          <input id="servingsBase" v-model="form.servingsBase" type="number" min="1" step="1" class="portions-input" />
        </div>
        <div class="row form-row-prep-cook">
          <div class="stack">
            <label for="prepTime">Préparation</label>
            <span class="time-input-wrap">
              <input id="prepTime" v-model="form.prepTimeMin" type="number" min="1" step="1" class="time-input" />
              min
            </span>
          </div>
          <div class="stack">
            <label for="restTime">Repos</label>
            <span class="time-input-wrap">
              <input id="restTime" v-model="form.restTimeMin" type="number" min="1" step="1" class="time-input" />
              min
            </span>
          </div>
          <div class="stack">
            <label for="cookTime">Cuisson</label>
            <span class="time-input-wrap">
              <input id="cookTime" v-model="form.cookTimeMin" type="number" min="1" step="1" class="time-input" />
              min
            </span>
          </div>
        </div>
      </div>

      <h3>Ingrédients</h3>
      <div v-for="ingredient in form.ingredients" :key="ingredient.id" class="ingredient-row">
        <input
          v-model="ingredient.label"
          type="text"
          placeholder="Nom ingrédient"
          class="ingredient-label-input"
          :aria-label="`ingredient-label-${ingredient.id}`"
        />
        <input
          v-model="ingredient.quantity"
          type="text"
          placeholder="Qté"
          class="ingredient-qty-input"
          :aria-label="`ingredient-quantity-${ingredient.id}`"
        />
        <input
          v-model="ingredient.unit"
          type="text"
          placeholder="Unité"
          class="ingredient-unit-input"
          :aria-label="`ingredient-unit-${ingredient.id}`"
        />
        <Button text icon="pi pi-trash" @click="removeIngredient(ingredient.id)" />
      </div>
      <Button text icon="pi pi-plus" label="Ajouter ingrédient" @click="addIngredient" />

      <h3>Préparation</h3>
      <div v-for="step in form.steps" :key="step.id" class="step-row">
        <textarea
          v-model="step.text"
          rows="3"
          placeholder="Décris l'étape"
          :aria-label="`step-text-${step.id}`"
        />
        <Button text icon="pi pi-trash" @click="removeStep(step.id)" />
      </div>
      <Button text icon="pi pi-plus" label="Ajouter étape" @click="addStep" />

      <div class="row form-footer-actions">
        <Button label="Annuler" text icon="pi pi-times" @click="backToList" />
        <Button
          label="Enregistrer"
          icon="pi pi-check"
          :disabled="!canSaveForm"
          @click="saveForm"
        />
      </div>
    </section>

    <footer class="app-footer">
      <a
        :href="`${baseUrl}politique-confidentialite.html`"
        target="_blank"
        rel="noopener noreferrer"
      >
        Politique de confidentialité
      </a>
    </footer>
  </main>
</template>
