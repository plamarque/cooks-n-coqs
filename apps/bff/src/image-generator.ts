import OpenAI from "openai";

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

/**
 * Génère une image de recette via DALL-E 3.
 * Style : flat lay, photo de plat type Instagram, élégant, appétissant.
 */
export async function generateRecipeImage(
  input: GenerateRecipeImageInput
): Promise<string | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  const ingredientsText = input.ingredients
    .map((i) => i.label)
    .filter(Boolean)
    .slice(0, 10)
    .join(", ");

  const prompt = `Professional flat lay food photography, Instagram-style recipe photo. The dish: "${input.title}". Main ingredients visible: ${ingredientsText || "various"}. Style: elegant, appetizing, on a clean white or neutral background, top-down view, natural lighting, high-end food blog quality. No text in the image.`;

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "natural",
      response_format: "url"
    });

    const url = response.data?.[0]?.url;
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

  const label = input.label.trim();
  if (!label) {
    return undefined;
  }

  const prompt = `Photorealistic product photo of exactly one cooking ingredient: "${label}". The ingredient must appear only once as the single subject (no duplicates, no repeated pieces). Tight close-up framing, centered, very legible. Pure white seamless background. No cast shadow, no drop shadow, no reflection, no vignette, no gradient background. No staging props, no plate, no utensils, no hands, no packaging brand, no text or labels.`;

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "natural",
      response_format: "url"
    });

    const url = response.data?.[0]?.url;
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

  const stepText = input.stepText.trim();
  if (!stepText) {
    return undefined;
  }

  const prompt = `Cinematic food photography illustration of a single cooking step. Depict this exact step action: "${stepText}". Focus on hands, utensils and ingredients involved in the action, realistic textures, appetizing atmosphere, kitchen context, natural light. No text, no labels, no watermark, no collage, no split-screen.`;

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "natural",
      response_format: "url"
    });

    const url = response.data?.[0]?.url;
    return typeof url === "string" ? url : undefined;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("Cooking step image generation failed", err);
    return undefined;
  }
}
