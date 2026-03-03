import { db } from "../storage/db";

export interface ResolveCookingStepImageInput {
  recipeId: string;
  stepId: string;
  stepText: string;
}

function normalizeStepText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function hashFnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildCookingStepImageId(input: ResolveCookingStepImageInput): string {
  const normalizedText = normalizeStepText(input.stepText).toLowerCase();
  const contentHash = hashFnv1a(normalizedText);
  return `${input.recipeId}:${input.stepId}:${contentHash}`;
}

export async function storeCookingStepImage(
  id: string,
  recipeId: string,
  stepId: string,
  blob: Blob
): Promise<void> {
  const now = new Date().toISOString();
  await db.cookingStepImages.put({
    id,
    recipeId,
    stepId,
    mimeType: blob.type,
    sizeBytes: blob.size,
    createdAt: now,
    blob
  });
}

/** Résout l'image d'une étape — lecture seule, ne génère plus d'images IA. */
export async function resolveCookingStepImageId(
  input: ResolveCookingStepImageInput
): Promise<string | undefined> {
  const stepText = normalizeStepText(input.stepText);
  if (!stepText) {
    return undefined;
  }

  const id = buildCookingStepImageId(input);
  const existing = await db.cookingStepImages.get(id);
  return existing ? id : undefined;
}

export async function getCookingStepImageBlobUrl(
  imageId: string
): Promise<string | undefined> {
  const row = await db.cookingStepImages.get(imageId);
  if (!row?.blob) {
    return undefined;
  }
  return URL.createObjectURL(row.blob);
}

export async function deleteCookingStepImagesForRecipe(recipeId: string): Promise<void> {
  await db.cookingStepImages.where("recipeId").equals(recipeId).delete();
}
