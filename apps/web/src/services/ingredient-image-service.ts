import { db } from "../storage/db";

const BFF_URL = import.meta.env.VITE_BFF_URL || "http://localhost:8787";
const INGREDIENT_ICON_SIZE = 96;

const inFlightById = new Map<string, Promise<string | undefined>>();

export interface ResolveIngredientImageInput {
  label: string;
  imageId?: string;
}

export function normalizeIngredientImageId(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function fetchGeneratedIngredientImageUrl(label: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${BFF_URL}/api/generate-ingredient-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
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
    const isBffGeneratedImage = url.includes("/api/generated-images/");
    const response = isBffGeneratedImage
      ? await fetch(url, {
          mode: "cors",
          signal: AbortSignal.timeout(15000)
        })
      : await fetch(`${BFF_URL}/api/proxy-image`, {
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

async function resizeToIngredientIcon(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = INGREDIENT_ICON_SIZE;
    canvas.height = INGREDIENT_ICON_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return blob;
    }

    const scale = Math.max(
      INGREDIENT_ICON_SIZE / bitmap.width,
      INGREDIENT_ICON_SIZE / bitmap.height
    );
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    const dx = (INGREDIENT_ICON_SIZE - drawWidth) / 2;
    const dy = (INGREDIENT_ICON_SIZE - drawHeight) / 2;

    ctx.drawImage(bitmap, dx, dy, drawWidth, drawHeight);
    bitmap.close();

    const resized = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.9)
    );
    return resized ?? blob;
  } catch {
    return blob;
  }
}

async function storeIngredientImage(id: string, blob: Blob): Promise<void> {
  const now = new Date().toISOString();
  await db.ingredientImages.put({
    id,
    mimeType: blob.type,
    sizeBytes: blob.size,
    createdAt: now,
    blob
  });
}

async function generateAndStoreIngredientImage(
  id: string,
  label: string
): Promise<string | undefined> {
  const imageUrl = await fetchGeneratedIngredientImageUrl(label);
  if (!imageUrl) {
    return undefined;
  }
  const remoteBlob = await fetchImageBlob(imageUrl);
  if (!remoteBlob) {
    return undefined;
  }
  const resizedBlob = await resizeToIngredientIcon(remoteBlob);
  await storeIngredientImage(id, resizedBlob);
  return id;
}

export async function resolveIngredientImageId(
  input: ResolveIngredientImageInput
): Promise<string | undefined> {
  const explicitId = input.imageId?.trim();
  const normalizedId = normalizeIngredientImageId(input.label);
  const id = explicitId || normalizedId;

  if (!id) {
    return undefined;
  }

  const existing = await db.ingredientImages.get(id);
  if (existing) {
    return id;
  }

  const label = input.label.trim();
  if (!label) {
    return undefined;
  }

  const inFlight = inFlightById.get(id);
  if (inFlight) {
    return inFlight;
  }

  const generation = generateAndStoreIngredientImage(id, label).finally(() => {
    inFlightById.delete(id);
  });
  inFlightById.set(id, generation);
  return generation;
}

export async function getIngredientImageBlobUrl(
  imageId: string
): Promise<string | undefined> {
  const row = await db.ingredientImages.get(imageId);
  if (!row?.blob) {
    return undefined;
  }
  return URL.createObjectURL(row.blob);
}

export async function deleteIngredientImage(id: string): Promise<void> {
  inFlightById.delete(id);
  await db.ingredientImages.delete(id);
}

export async function regenerateIngredientImage(
  id: string,
  label: string
): Promise<string | undefined> {
  await deleteIngredientImage(id);
  return generateAndStoreIngredientImage(id, label);
}

export async function storeIngredientImageFromFile(
  id: string,
  file: File
): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) {
    return undefined;
  }
  const blob = await file.arrayBuffer().then((buf) => new Blob([buf], { type: file.type }));
  const resizedBlob = await resizeToIngredientIcon(blob);
  await storeIngredientImage(id, resizedBlob);
  return id;
}

