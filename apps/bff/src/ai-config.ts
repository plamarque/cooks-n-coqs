/**
 * Configuration centralisée des modèles IA.
 * Permet un contrôle complet des coûts via variables d'environnement.
 */

export type ImageUseCase = "recipe" | "ingredient" | "cooking_step";
export type ChatUseCase = "parse" | "step_timer" | "reorder" | "extract";

const DEFAULTS = {
  image: {
    recipe: { model: "gpt-image-2", quality: "low" },
    ingredient: { model: "gpt-image-1-mini", quality: "low" },
    cooking_step: { model: "gpt-image-1-mini", quality: "low" }
  } as Record<ImageUseCase, { model: string; quality: string }>,
  chat: {
    parse: "gpt-5.6-terra",
    step_timer: "gpt-5.6-luna",
    reorder: "gpt-5.6-luna",
    extract: "gpt-5.6-luna"
  } as Record<ChatUseCase, string>
};

function getEnv(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

const IMAGE_MODEL_KEYS: Record<ImageUseCase, string> = {
  recipe: "AI_IMAGE_MODEL_RECIPE",
  ingredient: "AI_IMAGE_MODEL_INGREDIENT",
  cooking_step: "AI_IMAGE_MODEL_COOKING_STEP"
};

export function getImageModel(useCase: ImageUseCase): string {
  return getEnv(IMAGE_MODEL_KEYS[useCase]) ?? DEFAULTS.image[useCase].model;
}

const IMAGE_QUALITY_KEYS: Record<ImageUseCase, string> = {
  recipe: "AI_IMAGE_QUALITY_RECIPE",
  ingredient: "AI_IMAGE_QUALITY_INGREDIENT",
  cooking_step: "AI_IMAGE_QUALITY_COOKING_STEP"
};

export function getImageQuality(useCase: ImageUseCase): string {
  return getEnv(IMAGE_QUALITY_KEYS[useCase]) ?? DEFAULTS.image[useCase].quality;
}

const CHAT_MODEL_KEYS: Record<ChatUseCase, string> = {
  parse: "AI_CHAT_MODEL_PARSE",
  step_timer: "AI_CHAT_MODEL_STEP_TIMER",
  reorder: "AI_CHAT_MODEL_REORDER",
  extract: "AI_CHAT_MODEL_EXTRACT"
};

export function getChatModel(useCase: ChatUseCase): string {
  return getEnv(CHAT_MODEL_KEYS[useCase]) ?? getEnv("AI_CHAT_MODEL") ?? DEFAULTS.chat[useCase];
}
