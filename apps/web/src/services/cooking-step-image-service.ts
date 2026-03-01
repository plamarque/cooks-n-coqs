import { db } from "../storage/db";

const BFF_URL = import.meta.env.VITE_BFF_URL || "http://localhost:8787";
const inFlightById = new Map<string, Promise<string | undefined>>();

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

async function fetchGeneratedCookingStepImageUrl(
  stepText: string
): Promise<string | undefined> {
  try {
    const response = await fetch(`${BFF_URL}/api/generate-cooking-step-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepText }),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      return undefined;
    }
    const data = (await response.json()) as { imageUrl?: string };
    return data.imageUrl?.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function fetchImageBlob(url: string): Promise<Blob | undefined> {
  try {
    const response = await fetch(`${BFF_URL}/api/proxy-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) {
      return undefined;
    }
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) {
      return undefined;
    }
    return blob;
  } catch {
    return undefined;
  }
}

async function storeCookingStepImage(id: string, recipeId: string, stepId: string, blob: Blob): Promise<void> {
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

async function generateAndStoreCookingStepImage(
  id: string,
  recipeId: string,
  stepId: string,
  stepText: string
): Promise<string | undefined> {
  const imageUrl = await fetchGeneratedCookingStepImageUrl(stepText);
  if (!imageUrl) {
    return undefined;
  }

  const blob = await fetchImageBlob(imageUrl);
  if (!blob) {
    return undefined;
  }

  await storeCookingStepImage(id, recipeId, stepId, blob);
  return id;
}

export async function resolveCookingStepImageId(
  input: ResolveCookingStepImageInput
): Promise<string | undefined> {
  const stepText = normalizeStepText(input.stepText);
  if (!stepText) {
    return undefined;
  }

  const id = buildCookingStepImageId(input);
  const existing = await db.cookingStepImages.get(id);
  if (existing) {
    return id;
  }

  const inFlight = inFlightById.get(id);
  if (inFlight) {
    return inFlight;
  }

  const generation = generateAndStoreCookingStepImage(
    id,
    input.recipeId,
    input.stepId,
    stepText
  ).finally(() => {
    inFlightById.delete(id);
  });
  inFlightById.set(id, generation);
  return generation;
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
  const recipeRows = await db.cookingStepImages
    .where("recipeId")
    .equals(recipeId)
    .toArray();
  for (const row of recipeRows) {
    inFlightById.delete(row.id);
  }
  await db.cookingStepImages.where("recipeId").equals(recipeId).delete();
}
