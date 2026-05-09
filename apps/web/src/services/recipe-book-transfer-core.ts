import type { Recipe, RecipeImage, IngredientImage } from "@cookies-et-coquilettes/domain";
import type { CookingStepImage } from "../storage/db";

/** Identifiant de format dans le JSON exporté (v1). */
export const RECIPE_BOOK_FORMAT = "cookies-et-coquilettes-recipe-book" as const;
export const RECIPE_BOOK_VERSION = 1 as const;

export type RecipeBookImageRowExport = Pick<
  RecipeImage,
  "id" | "mimeType" | "sizeBytes" | "createdAt" | "width" | "height"
> & {
  dataBase64: string;
};

export type RecipeBookIngredientImageRowExport = Pick<
  IngredientImage,
  "id" | "mimeType" | "sizeBytes" | "createdAt" | "width" | "height"
> & {
  dataBase64: string;
};

export type RecipeBookCookingStepImageRowExport = Pick<
  CookingStepImage,
  "id" | "recipeId" | "stepId" | "mimeType" | "sizeBytes" | "createdAt"
> & {
  dataBase64: string;
};

export interface RecipeBookExportV1 {
  format: typeof RECIPE_BOOK_FORMAT;
  version: typeof RECIPE_BOOK_VERSION;
  exportedAt: string;
  recipes: Recipe[];
  recipeImages: RecipeBookImageRowExport[];
  ingredientImages: RecipeBookIngredientImageRowExport[];
  cookingStepImages: RecipeBookCookingStepImageRowExport[];
}

export class RecipeBookImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeBookImportError";
  }
}

/**
 * UUID v4 pour l’import d’archive (remappage des IDs).
 * Repli si `crypto.randomUUID` est absent (ex. page servie en HTTP sur mobile).
 */
export function newImportTransferId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Collecte les IDs d’images recette (table `images`) référencés par les recettes. */
export function collectRecipeImageIdsFromRecipes(recipes: Recipe[]): Set<string> {
  const ids = new Set<string>();
  for (const recipe of recipes) {
    if (recipe.imageId) ids.add(recipe.imageId);
    for (const sid of recipe.sourceImageIds ?? []) {
      if (sid) ids.add(sid);
    }
    for (const step of recipe.steps) {
      for (const medium of step.media ?? []) {
        if (medium.type === "image" && medium.imageId) ids.add(medium.imageId);
      }
    }
  }
  return ids;
}

/** Collecte les IDs d’images ingrédients référencés par les recettes. */
export function collectIngredientImageIdsFromRecipes(recipes: Recipe[]): Set<string> {
  const ids = new Set<string>();
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      if (ing.imageId) ids.add(ing.imageId);
    }
  }
  return ids;
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

/** Parse et valide la structure minimale d’un export v1 (sans toucher à la base). */
export function parseRecipeBookExportV1(text: string): RecipeBookExportV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new RecipeBookImportError("Le fichier n’est pas un JSON valide.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new RecipeBookImportError("Format d’archive invalide.");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.format !== RECIPE_BOOK_FORMAT) {
    throw new RecipeBookImportError("Ce fichier n’est pas une archive Cookies & Coquillettes.");
  }
  if (obj.version !== RECIPE_BOOK_VERSION) {
    throw new RecipeBookImportError(`Version d’archive non supportée : ${String(obj.version)}.`);
  }
  if (typeof obj.exportedAt !== "string") {
    throw new RecipeBookImportError("Champ exportedAt manquant ou invalide.");
  }
  if (!Array.isArray(obj.recipes)) {
    throw new RecipeBookImportError("Liste de recettes manquante.");
  }
  if (!Array.isArray(obj.recipeImages)) {
    throw new RecipeBookImportError("Liste recipeImages manquante.");
  }
  if (!Array.isArray(obj.ingredientImages)) {
    throw new RecipeBookImportError("Liste ingredientImages manquante.");
  }
  if (!Array.isArray(obj.cookingStepImages)) {
    throw new RecipeBookImportError("Liste cookingStepImages manquante.");
  }
  return obj as unknown as RecipeBookExportV1;
}

function remapRecipeImageRefs(
  recipe: Recipe,
  recipeImageIdMap: Map<string, string>,
  ingredientImageIdMap: Map<string, string>
): Recipe {
  const mapRecipeImg = (id: string | undefined): string | undefined => {
    if (!id) return undefined;
    const next = recipeImageIdMap.get(id);
    if (!next) {
      throw new RecipeBookImportError(`Référence d’image recette absente du fichier : ${id}`);
    }
    return next;
  };
  const mapIngImg = (id: string | undefined): string | undefined => {
    if (!id) return undefined;
    const next = ingredientImageIdMap.get(id);
    if (!next) {
      throw new RecipeBookImportError(`Référence d’image ingrédient absente du fichier : ${id}`);
    }
    return next;
  };

  return {
    ...recipe,
    imageId: mapRecipeImg(recipe.imageId),
    sourceImageIds: recipe.sourceImageIds?.map((id) => mapRecipeImg(id)!).filter(Boolean) as
      | string[]
      | undefined,
    ingredients: recipe.ingredients.map((ing) => ({
      ...ing,
      imageId: mapIngImg(ing.imageId)
    })),
    steps: recipe.steps.map((step) => ({
      ...step,
      media: step.media?.map((medium) =>
        medium.type === "image"
          ? { type: "image" as const, imageId: mapRecipeImg(medium.imageId)! }
          : medium
      )
    }))
  };
}

/**
 * Construit les recettes et lignes Dexie prêtes à l’écriture, avec nouveaux IDs
 * (aucune collision avec une base existante).
 */
export function prepareImportFromExportV1(payload: RecipeBookExportV1): {
  recipes: Recipe[];
  recipeImageRows: Array<RecipeImage & { blob: Blob }>;
  ingredientImageRows: Array<IngredientImage & { blob: Blob }>;
  cookingStepImageRows: Array<CookingStepImage & { blob: Blob }>;
} {
  const recipeIdMap = new Map<string, string>();
  for (const r of payload.recipes) {
    recipeIdMap.set(r.id, newImportTransferId());
  }

  const recipeImageIdMap = new Map<string, string>();
  for (const row of payload.recipeImages) {
    recipeImageIdMap.set(row.id, newImportTransferId());
  }

  const ingredientImageIdMap = new Map<string, string>();
  for (const row of payload.ingredientImages) {
    ingredientImageIdMap.set(row.id, newImportTransferId());
  }

  const declaredRecipeImageIds = new Set(payload.recipeImages.map((r) => r.id));
  const declaredIngredientImageIds = new Set(payload.ingredientImages.map((r) => r.id));

  for (const recipe of payload.recipes) {
    const needRecipe = collectRecipeImageIdsFromRecipes([recipe]);
    for (const id of needRecipe) {
      if (!declaredRecipeImageIds.has(id)) {
        throw new RecipeBookImportError(`L’archive ne contient pas l’image recette « ${id} ».`);
      }
    }
    const needIng = collectIngredientImageIdsFromRecipes([recipe]);
    for (const id of needIng) {
      if (!declaredIngredientImageIds.has(id)) {
        throw new RecipeBookImportError(`L’archive ne contient pas l’image ingrédient « ${id} ».`);
      }
    }
  }

  const recipes: Recipe[] = payload.recipes.map((r) => {
    const newId = recipeIdMap.get(r.id)!;
    const withImages = remapRecipeImageRefs(r, recipeImageIdMap, ingredientImageIdMap);
    return { ...withImages, id: newId };
  });

  const recipeImageRows: Array<RecipeImage & { blob: Blob }> = payload.recipeImages.map((row) => {
    const newId = recipeImageIdMap.get(row.id)!;
    const blob = base64ToBlob(row.dataBase64, row.mimeType);
    return {
      id: newId,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt,
      width: row.width,
      height: row.height,
      blob
    };
  });

  const ingredientImageRows: Array<IngredientImage & { blob: Blob }> = payload.ingredientImages.map(
    (row) => {
      const newId = ingredientImageIdMap.get(row.id)!;
      const blob = base64ToBlob(row.dataBase64, row.mimeType);
      return {
        id: newId,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt,
        width: row.width,
        height: row.height,
        blob
      };
    }
  );

  const cookingStepImageRows: Array<CookingStepImage & { blob: Blob }> = payload.cookingStepImages.map(
    (row) => {
      const newRecipeId = recipeIdMap.get(row.recipeId);
      if (!newRecipeId) {
        throw new RecipeBookImportError(`Image d’étape cuisine orpheline (recipeId ${row.recipeId}).`);
      }
      const blob = base64ToBlob(row.dataBase64, row.mimeType);
      return {
        id: newImportTransferId(),
        recipeId: newRecipeId,
        stepId: row.stepId,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt,
        blob
      };
    }
  );

  return { recipes, recipeImageRows, ingredientImageRows, cookingStepImageRows };
}
