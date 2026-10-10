import type {
  Recipe,
  RecipeFilters,
  RecipeService
} from "@cookies-et-coquilettes/domain";
import {
  assertRecipeValidForSave,
  normalizeRecipeForSave,
  scaleIngredientsFromBase
} from "@cookies-et-coquilettes/domain";
import { db } from "../storage/db";
import { deleteCookingStepImagesForRecipe } from "./cooking-step-image-service";

function defaultBffUrl(): string {
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".ts.net")) {
    return `https://${window.location.hostname}:8443`;
  }
  return "http://localhost:8787";
}

const BFF_URL = import.meta.env?.VITE_BFF_URL || defaultBffUrl();

const notebookTitleCollator = new Intl.Collator("fr", { sensitivity: "base" });

/** Ordre visible du Cahier : titre français, puis identifiant pour lever toute égalité. */
export function compareRecipesByNotebookTitle(a: Recipe, b: Recipe): number {
  return notebookTitleCollator.compare(a.title, b.title)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export type ImageStorageResult =
  | { imageId: string }
  | { imageId: undefined; issue: "fetch" | "invalid-image" | "storage" };

export type PreparedImageResult =
  | { blob: Blob }
  | { blob: undefined; issue: "fetch" | "invalid-image" };

/** Une ressource déjà servie par l’application ne transite jamais par le BFF. */
export function shouldProxyImageUrl(url: string, pageOrigin: string | undefined = typeof window === "undefined" ? undefined : window.location.origin): boolean {
  if (!/^https?:\/\//i.test(url) || isGeneratedImageFromConfiguredBff(url)) return false;
  try {
    return !pageOrigin || new URL(url).origin !== pageOrigin;
  } catch {
    return true;
  }
}

function isGeneratedImageFromConfiguredBff(url: string): boolean {
  try {
    const imageUrl = new URL(url);
    const bffUrl = new URL(BFF_URL);
    return imageUrl.origin === bffUrl.origin && imageUrl.pathname.startsWith("/api/generated-images/");
  } catch {
    return false;
  }
}

/** Télécharge une illustration sans encore modifier IndexedDB. */
export async function prepareImageFromUrl(url: string): Promise<PreparedImageResult> {
  try {
    const proxyExternalImage = shouldProxyImageUrl(url);
    const fetchUrl = proxyExternalImage
      ? `${BFF_URL}/api/proxy-image`
      : url;
    const fetchOpts: RequestInit = proxyExternalImage
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(15000)
        }
      : { mode: "cors", signal: AbortSignal.timeout(10000) };
    const res = await fetch(fetchUrl, fetchOpts);
    if (!res.ok) return { blob: undefined, issue: "fetch" };
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return { blob: undefined, issue: "invalid-image" };
    return { blob };
  } catch {
    return { blob: undefined, issue: "fetch" };
  }
}

/** Ligne image prête à être ajoutée dans la transaction appelante. */
export function createRecipeImageRow(blob: Blob, id: string = crypto.randomUUID()) {
  return {
    id,
    mimeType: blob.type,
    sizeBytes: blob.size,
    createdAt: new Date().toISOString(),
    blob
  };
}

/** Télécharge puis écrit l'illustration dans IndexedDB sans exposer l'URL source. */
export async function storeImageFromUrlWithResult(url: string): Promise<ImageStorageResult> {
  const prepared = await prepareImageFromUrl(url);
  if (!prepared.blob) return { imageId: undefined, issue: prepared.issue };
  try {
    const row = createRecipeImageRow(prepared.blob);
    await db.images.add(row);
    return { imageId: row.id };
  } catch {
    return { imageId: undefined, issue: "storage" };
  }
}

/** Contrat historique pour les flux best-effort existants. */
export async function storeImageFromUrl(url: string): Promise<string | undefined> {
  return (await storeImageFromUrlWithResult(url)).imageId;
}

export async function getImageBlobUrl(imageId: string): Promise<string | undefined> {
  const row = await db.images.get(imageId);
  if (!row?.blob) return undefined;
  return URL.createObjectURL(row.blob);
}

export async function storeImageFromFile(file: File): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) return undefined;
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.images.add({
      id,
      mimeType: file.type,
      sizeBytes: file.size,
      createdAt: now,
      blob: file
    });
    return id;
  } catch {
    return undefined;
  }
}

function bySearch(recipe: Recipe, search?: string): boolean {
  if (!search) {
    return true;
  }

  const normalized = search.toLowerCase();
  return (
    recipe.title.toLowerCase().includes(normalized) ||
    recipe.ingredients.some((ingredient) =>
      ingredient.label.toLowerCase().includes(normalized)
    )
  );
}

/** Applique les filtres du Cahier avant son ordre de lecture unique. */
export function filterAndSortNotebookRecipes(recipes: Recipe[], filters?: RecipeFilters): Recipe[] {
  return recipes
    .filter((recipe) =>
      filters?.category ? recipe.category === filters.category : true
    )
    .filter((recipe) =>
      filters?.favorite !== undefined ? recipe.favorite === filters.favorite : true
    )
    .filter((recipe) => bySearch(recipe, filters?.search))
    .filter((recipe) => !filters?.personalCategory || (recipe.personalCategories ?? []).some((value) => value.localeCompare(filters.personalCategory!, "fr", { sensitivity: "base" }) === 0))
    .sort(compareRecipesByNotebookTitle);
}

class DexieRecipeService implements RecipeService {
  async createRecipe(recipe: Recipe): Promise<void> {
    const normalized = normalizeRecipeForSave(recipe);
    assertRecipeValidForSave(normalized);
    await db.recipes.put(normalized);
  }

  async updateRecipe(recipeId: string, patch: Partial<Recipe>): Promise<void> {
    const current = await db.recipes.get(recipeId);
    if (!current) {
      throw new Error(`Recipe not found: ${recipeId}`);
    }

    const updated = normalizeRecipeForSave({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString()
    });
    assertRecipeValidForSave(updated);
    await db.recipes.put(updated);
  }

  async deleteRecipe(recipeId: string): Promise<void> {
    const current = await db.recipes.get(recipeId);
    if (!current) {
      return;
    }

    await db.recipes.delete(recipeId);
    if (current.imageId) {
      await db.images.delete(current.imageId);
    }
    for (const id of current.sourceImageIds ?? []) {
      await db.images.delete(id).catch(() => {});
    }
    for (const step of current.steps) {
      for (const medium of step.media ?? []) {
        if (medium.type === "image") {
          await db.images.delete(medium.imageId).catch(() => {});
        }
      }
    }
    await deleteCookingStepImagesForRecipe(recipeId);
  }

  async toggleFavorite(recipeId: string, favorite?: boolean): Promise<void> {
    const current = await db.recipes.get(recipeId);
    if (!current) {
      throw new Error(`Recipe not found: ${recipeId}`);
    }

    await db.recipes.put({
      ...current,
      favorite: favorite ?? !current.favorite,
      updatedAt: new Date().toISOString()
    });
  }

  async listRecipes(filters?: RecipeFilters): Promise<Recipe[]> {
    const all = await db.recipes.toArray();
    return filterAndSortNotebookRecipes(all, filters);
  }

  async scaleRecipe(recipeId: string, servings: number): Promise<Recipe> {
    if (servings <= 0) {
      throw new Error("servings must be > 0");
    }

    const current = await db.recipes.get(recipeId);
    if (!current) {
      throw new Error(`Recipe not found: ${recipeId}`);
    }

    const referenceServings = current.servingsBase;
    if (!referenceServings || referenceServings <= 0) {
      throw new Error("Recipe has no valid servings reference");
    }

    const updated: Recipe = {
      ...current,
      servingsCurrent: servings,
      ingredients: scaleIngredientsFromBase(
        current.ingredients,
        servings,
        referenceServings
      ),
      updatedAt: new Date().toISOString()
    };

    await db.recipes.put(updated);
    return updated;
  }
}

export const dexieRecipeService = new DexieRecipeService();
