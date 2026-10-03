import OpenAI from "openai";
import { getImageModel, getImageQuality } from "./ai-config.js";
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

export function buildImageParams(useCase: ImageUseCase): {
  model: string;
  size: "1024x1024";
  quality: string;
  style?: "natural" | "vivid";
} {
  const model = getImageModel(useCase);
  const quality = getImageQuality(useCase);

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

  const { model, size, quality, style } = buildImageParams("recipe");

  try {
    const client = new OpenAI({ apiKey });
    const useGptImage = isGptImageModel(model);
    const baseOptions = {
      model,
      prompt,
      n: 1 as const,
      size,
      quality: quality as "low" | "medium" | "high" | "standard" | "hd",
      ...(style && { style })
    };
    const response = await client.images.generate(
      useGptImage ? baseOptions : { ...baseOptions, response_format: "url" }
    );
    const data = "data" in response ? response.data : undefined;
    const first = data?.[0];
    let url: string | undefined;
    if (useGptImage && first && "b64_json" in first && typeof first.b64_json === "string") {
      url = `data:image/png;base64,${first.b64_json}`;
    } else if (first && "url" in first && typeof first.url === "string") {
      url = first.url;
    }
    return typeof url === "string" ? url : undefined;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Recipe image generation failed", err);
    return undefined;
  }
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

  const { model, size, quality, style } = buildImageParams("ingredient");

  try {
    const client = new OpenAI({ apiKey });
    const useGptImage = isGptImageModel(model);
    const baseOptions = {
      model,
      prompt,
      n: 1 as const,
      size,
      quality: quality as "low" | "medium" | "high" | "standard" | "hd",
      ...(style && { style })
    };
    const response = await client.images.generate(
      useGptImage ? baseOptions : { ...baseOptions, response_format: "url" }
    );
    const data = "data" in response ? response.data : undefined;
    const first = data?.[0];
    let url: string | undefined;
    if (useGptImage && first && "b64_json" in first && typeof first.b64_json === "string") {
      url = `data:image/png;base64,${first.b64_json}`;
    } else if (first && "url" in first && typeof first.url === "string") {
      url = first.url;
    }
    return typeof url === "string" ? url : undefined;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Ingredient image generation failed", err);
    return undefined;
  }
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

  const { model, size, quality, style } = buildImageParams("cooking_step");

  try {
    const client = new OpenAI({ apiKey });
    const useGptImage = isGptImageModel(model);
    const baseOptions = {
      model,
      prompt,
      n: 1 as const,
      size,
      quality: quality as "low" | "medium" | "high" | "standard" | "hd",
      ...(style && { style })
    };
    const response = await client.images.generate(
      useGptImage ? baseOptions : { ...baseOptions, response_format: "url" }
    );
    const data = "data" in response ? response.data : undefined;
    const first = data?.[0];
    let url: string | undefined;
    if (useGptImage && first && "b64_json" in first && typeof first.b64_json === "string") {
      url = `data:image/png;base64,${first.b64_json}`;
    } else if (first && "url" in first && typeof first.url === "string") {
      url = first.url;
    }
    return typeof url === "string" ? url : undefined;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Cooking step image generation failed", err);
    return undefined;
  }
}
