/**
 * Configuration centralisée des modèles IA.
 * Permet un contrôle complet des coûts via variables d'environnement.
 */

export type ImageUseCase = "recipe" | "ingredient" | "cooking_step";
export interface ImageGenerationPolicy {
  primaryModel: string;
  fallbackModel: string;
  quality: string;
}
export type ChatUseCase = "parse" | "step_timer" | "reorder" | "extract" | "assistant_recipe" | "assistant_clarify" | "assistant_advice";

const DEFAULTS = {
  image: {
    recipe: { primaryModel: "gpt-image-1-mini", fallbackModel: "gpt-image-2.5-flare", quality: "low" },
    ingredient: { primaryModel: "gpt-image-1-mini", fallbackModel: "gpt-image-2.5-flare", quality: "low" },
    cooking_step: { primaryModel: "gpt-image-1-mini", fallbackModel: "gpt-image-2.5-flare", quality: "low" }
  } as Record<ImageUseCase, ImageGenerationPolicy>,
  chat: {
    parse: "gpt-5.6-terra",
    step_timer: "gpt-5.6-luna",
    reorder: "gpt-5.6-luna",
    extract: "gpt-5.6-luna",
    assistant_recipe: "gpt-5.6-terra",
    assistant_clarify: "gpt-5.6-luna",
    assistant_advice: "gpt-5.6-luna"
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
  return getEnv(IMAGE_MODEL_KEYS[useCase]) ?? DEFAULTS.image[useCase].primaryModel;
}

const IMAGE_FALLBACK_MODEL_KEYS: Record<ImageUseCase, string> = {
  recipe: "AI_IMAGE_FALLBACK_MODEL_RECIPE",
  ingredient: "AI_IMAGE_FALLBACK_MODEL_INGREDIENT",
  cooking_step: "AI_IMAGE_FALLBACK_MODEL_COOKING_STEP"
};

export function getImageFallbackModel(useCase: ImageUseCase): string {
  return getEnv(IMAGE_FALLBACK_MODEL_KEYS[useCase]) ?? DEFAULTS.image[useCase].fallbackModel;
}

const IMAGE_QUALITY_KEYS: Record<ImageUseCase, string> = {
  recipe: "AI_IMAGE_QUALITY_RECIPE",
  ingredient: "AI_IMAGE_QUALITY_INGREDIENT",
  cooking_step: "AI_IMAGE_QUALITY_COOKING_STEP"
};

export function getImageQuality(useCase: ImageUseCase): string {
  return getEnv(IMAGE_QUALITY_KEYS[useCase]) ?? DEFAULTS.image[useCase].quality;
}

export function getImageGenerationPolicy(useCase: ImageUseCase): ImageGenerationPolicy {
  return {
    primaryModel: getImageModel(useCase),
    fallbackModel: getImageFallbackModel(useCase),
    quality: getImageQuality(useCase)
  };
}

const CHAT_MODEL_KEYS: Record<ChatUseCase, string> = {
  parse: "AI_CHAT_MODEL_PARSE",
  step_timer: "AI_CHAT_MODEL_STEP_TIMER",
  reorder: "AI_CHAT_MODEL_REORDER",
  extract: "AI_CHAT_MODEL_EXTRACT",
  assistant_recipe: "AI_CHAT_MODEL_ASSISTANT_RECIPE",
  assistant_clarify: "AI_CHAT_MODEL_ASSISTANT_CLARIFY",
  assistant_advice: "AI_CHAT_MODEL_ASSISTANT_ADVICE"
};

export function getChatModel(useCase: ChatUseCase): string {
  return getEnv(CHAT_MODEL_KEYS[useCase]) ?? getEnv("AI_CHAT_MODEL") ?? DEFAULTS.chat[useCase];
}
