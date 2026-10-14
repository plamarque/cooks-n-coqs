import OpenAI from "openai";
import { getImageGenerationPolicy } from "./ai-config.js";
import type { ImageUseCase } from "./ai-config.js";

export interface GenerateRecipeImageInput {
  title: string;
  ingredients: Array<{ label: string }>;
  steps: Array<{ text: string }>;
}

export interface GenerateIngredientImageInput {
  label: string;
}

export interface GenerateCookingStepImageInput {
  stepText: string;
}

function isGptImageModel(model: string): boolean {
  return model.startsWith("gpt-image-");
}

export function buildImageParams(useCase: ImageUseCase, model = getImageGenerationPolicy(useCase).primaryModel): {
  model: string;
  size: "1024x1024";
  quality: string;
  style?: "natural" | "vivid";
} {
  const { quality } = getImageGenerationPolicy(useCase);

  const base: { model: string; size: "1024x1024"; quality: string; style?: "natural" | "vivid" } = {
    model,
    size: "1024x1024",
    quality
  };

  if (isGptImageModel(model)) {
    return base;
  }

  if (model.startsWith("dall-e-")) {
    const dalleQuality: "standard" | "hd" = quality === "hd" ? "hd" : "standard";
    return {
      ...base,
      quality: dalleQuality,
      style: "natural"
    };
  }

  return base;
}

type ImageClient = {
  images: {
    generate: (options: Record<string, unknown>) => Promise<unknown>;
  };
};

/** Injection réservée aux tests : le navigateur ne reçoit jamais la clé BFF. */
export const imageGenerationDependencies: {
  createClient: (apiKey: string) => ImageClient;
} = {
  createClient: (apiKey) => new OpenAI({ apiKey }) as unknown as ImageClient
};

async function generateImageWithPolicy(
  useCase: ImageUseCase,
  prompt: string,
  apiKey: string
): Promise<string | undefined> {
  const { primaryModel, fallbackModel } = getImageGenerationPolicy(useCase);
  const client = imageGenerationDependencies.createClient(apiKey);

  const tryModel = async (model: string): Promise<{ url?: string; cause?: "provider_error" | "empty_response" }> => {
    const { size, quality, style } = buildImageParams(useCase, model);
    try {
      const baseOptions = {
        model,
        prompt,
        n: 1 as const,
        size,
        quality: quality as "low" | "medium" | "high" | "standard" | "hd",
        ...(style && { style })
      };
      const response = await client.images.generate(
        isGptImageModel(model) ? baseOptions : { ...baseOptions, response_format: "url" }
      ) as { data?: Array<{ b64_json?: unknown; url?: unknown }> };
      const first = response.data?.[0];
      if (isGptImageModel(model) && typeof first?.b64_json === "string" && first.b64_json.trim()) {
        return { url: `data:image/png;base64,${first.b64_json}` };
      }
      return typeof first?.url === "string" && first.url.trim() ? { url: first.url } : { cause: "empty_response" };
    } catch {
      return { cause: "provider_error" };
    }
  };

  const primaryResult = await tryModel(primaryModel);
  if (primaryResult.url) {
    return primaryResult.url;
  }

  // Le repli est intentionnellement limité au modèle configuré : pas de reprise réseau globale.
  // eslint-disable-next-line no-console
  console.warn("Image generation fallback", { useCase, primaryModel, fallbackModel, primaryCause: primaryResult.cause });
  if (fallbackModel === primaryModel) {
    // eslint-disable-next-line no-console
    console.warn("Image generation failed after fallback", { useCase, primaryModel, fallbackModel, fallbackCause: "same_as_primary" });
    return undefined;
  }
  const fallbackResult = await tryModel(fallbackModel);
  if (!fallbackResult.url) {
    // eslint-disable-next-line no-console
    console.warn("Image generation failed after fallback", { useCase, primaryModel, fallbackModel, fallbackCause: fallbackResult.cause });
  }
  return fallbackResult.url;
}

export function buildRecipeImagePrompt(input: GenerateRecipeImageInput): string {
  const ingredientsText = input.ingredients.map((i) => i.label).filter(Boolean).slice(0, 10).join(", ");
  return `Professional flat lay food photography, Instagram-style recipe photo. The dish: "${input.title}". Main ingredients visible: ${ingredientsText || "various"}. Style: elegant, appetizing, on a clean white or neutral background, top-down view, natural lighting, high-end food blog quality. No text in the image.`;
}

export function buildIngredientImagePrompt(input: GenerateIngredientImageInput): string | undefined {
  const label = input.label.trim();
  return label ? `Photorealistic product photo of exactly one cooking ingredient: "${label}". The ingredient must appear only once as the single subject (no duplicates, no repeated pieces). Tight close-up framing, centered, very legible. Pure white seamless background. No cast shadow, no drop shadow, no reflection, no vignette, no gradient background. No staging props, no plate, no utensils, no hands, no packaging brand, no text or labels.` : undefined;
}

export function buildCookingStepImagePrompt(input: GenerateCookingStepImageInput): string | undefined {
  const stepText = input.stepText.trim();
  return stepText ? `Cinematic food photography illustration of a single cooking step. Depict this exact step action: "${stepText}". Focus on hands, utensils and ingredients involved in the action, realistic textures, appetizing atmosphere, kitchen context, natural light. No text, no labels, no watermark, no collage, no split-screen.` : undefined;
}

/**
 * Génère une image de recette via l'API image IA (GPT Image ou DALL-E).
 * Style : flat lay, photo de plat type Instagram, élégant, appétissant.
 */
export async function generateRecipeImage(
  input: GenerateRecipeImageInput
): Promise<string | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  const prompt = buildRecipeImagePrompt(input);

  return generateImageWithPolicy("recipe", prompt, apiKey);
}

/**
 * Génère une image d'ingrédient isolé (un seul sujet, gros plan, fond blanc pur, sans ombre).
 */
export async function generateIngredientImage(
  input: GenerateIngredientImageInput
): Promise<string | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  const prompt = buildIngredientImagePrompt(input);
  if (!prompt) {
    return undefined;
  }

  return generateImageWithPolicy("ingredient", prompt, apiKey);
}

/**
 * Génère une illustration d'étape de cuisine, basée sur le texte de l'étape.
 */
export async function generateCookingStepImage(
  input: GenerateCookingStepImageInput
): Promise<string | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  const prompt = buildCookingStepImagePrompt(input);
  if (!prompt) {
    return undefined;
  }

  return generateImageWithPolicy("cooking_step", prompt, apiKey);
}
