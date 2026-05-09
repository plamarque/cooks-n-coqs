import type { Recipe, RecipeImage, IngredientImage, InstructionStep, StepMedium } from "@cookies-et-coquilettes/domain";
import type { CookingStepImage } from "../storage/db";

/** Identifiant de format dans le JSON exporté. */
export const RECIPE_BOOK_FORMAT = "cookies-et-coquilettes-recipe-book" as const;

/** Version courante émise à l’export (archive légère sans blobs d’images). */
export const RECIPE_BOOK_EXPORT_VERSION = 3 as const;
export type RecipeBookExportVersion = 1 | 2 | typeof RECIPE_BOOK_EXPORT_VERSION;

/** @deprecated alias de RECIPE_BOOK_EXPORT_VERSION */
export const RECIPE_BOOK_VERSION = RECIPE_BOOK_EXPORT_VERSION;

/** Ligne d’image recette : inline (base64) ou référence cache BFF (sans blob). */
export type RecipeBookRecipeImageRowExport =
  | (Pick<RecipeImage, "id" | "mimeType" | "sizeBytes" | "createdAt" | "width" | "height"> & {
      dataBase64: string;
    })
  | (Pick<RecipeImage, "id" | "mimeType" | "sizeBytes" | "createdAt" | "width" | "height"> & {
      bffGeneratedKey: string;
    });

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

/** Métadonnées d’export (v2) ; absent en v1 = comportement « tout inclus ». */
export interface RecipeBookExportProfile {
  includeIngredientImages?: boolean;
  includeCookingStepImages?: boolean;
  includeRecipeImages?: boolean;
}

export interface RecipeBookExportPayload {
  format: typeof RECIPE_BOOK_FORMAT;
  version: RecipeBookExportVersion;
  exportedAt: string;
  /** Présent à partir de la v2 d’archive. */
  exportProfile?: RecipeBookExportProfile;
  recipes: Recipe[];
  recipeImages: RecipeBookRecipeImageRowExport[];
  ingredientImages: RecipeBookIngredientImageRowExport[];
  cookingStepImages: RecipeBookCookingStepImageRowExport[];
}

/** @deprecated utiliser RecipeBookRecipeImageRowExport */
export type RecipeBookImageRowExport = Extract<RecipeBookRecipeImageRowExport, { dataBase64: string }>;

/** @deprecated utiliser RecipeBookExportPayload */
export type RecipeBookExportV1 = RecipeBookExportPayload;

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

export function isRecipeImageRowBffRef(
  row: RecipeBookRecipeImageRowExport
): row is Extract<RecipeBookRecipeImageRowExport, { bffGeneratedKey: string }> {
  return typeof (row as { bffGeneratedKey?: string }).bffGeneratedKey === "string";
}

/** Profil effectif à l’import (v1 = tout inclus ; v3 = jamais d’images dans le fichier). */
export function resolvedExportProfile(payload: RecipeBookExportPayload): Required<RecipeBookExportProfile> {
  if (payload.version === 3) {
    return {
      includeIngredientImages: false,
      includeCookingStepImages: false,
      includeRecipeImages: false
    };
  }
  if (payload.version === 1 || !payload.exportProfile) {
    return {
      includeIngredientImages: true,
      includeCookingStepImages: true,
      includeRecipeImages: true
    };
  }
  return {
    includeIngredientImages: payload.exportProfile.includeIngredientImages !== false,
    includeCookingStepImages: payload.exportProfile.includeCookingStepImages !== false,
    includeRecipeImages: payload.exportProfile.includeRecipeImages !== false
  };
}

/** Archives « texte seul » : les recettes importées portent `pendingBookMediaHydration` (réhydratation à l’ouverture détail). */
export function shouldRehydrateRecipeMediaAfterImport(payload: RecipeBookExportPayload): boolean {
  const p = resolvedExportProfile(payload);
  return !p.includeRecipeImages && !p.includeIngredientImages && !p.includeCookingStepImages;
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

/**
 * Retire les recettes dont la clé stable est déjà vue (base locale ou doublon dans le fichier).
 * Réduit les tableaux d’images pour ne garder que ce qui est encore référencé.
 */
export function filterRecipeBookExportPayloadForDedup(
  payload: RecipeBookExportPayload,
  stableKeyByRecipeIndex: ReadonlyArray<string | undefined>,
  existingStableKeys: ReadonlySet<string>
): { payload: RecipeBookExportPayload; skippedDuplicateCount: number } {
  if (stableKeyByRecipeIndex.length !== payload.recipes.length) {
    throw new RecipeBookImportError("Erreur interne : clés de dédoublonnage incohérentes.");
  }

  const seen = new Set(existingStableKeys);
  let skippedDuplicateCount = 0;
  const keptRecipes: Recipe[] = [];

  for (let i = 0; i < payload.recipes.length; i++) {
    const recipe = payload.recipes[i]!;
    const key = stableKeyByRecipeIndex[i];
    if (key && seen.has(key)) {
      skippedDuplicateCount += 1;
      continue;
    }
    const withKey: Recipe = {
      ...recipe,
      importSourceStableKey: key ?? recipe.importSourceStableKey
    };
    keptRecipes.push(withKey);
    if (key) {
      seen.add(key);
    }
  }

  const keptRecipeIds = new Set(keptRecipes.map((r) => r.id));
  const recipeImgIds = collectRecipeImageIdsFromRecipes(keptRecipes);
  const ingImgIds = collectIngredientImageIdsFromRecipes(keptRecipes);

  const recipeImages = payload.recipeImages.filter((row) => recipeImgIds.has(row.id));
  const ingredientImages = payload.ingredientImages.filter((row) => ingImgIds.has(row.id));
  const cookingStepImages = payload.cookingStepImages.filter((row) => keptRecipeIds.has(row.recipeId));

  return {
    payload: {
      ...payload,
      recipes: keptRecipes,
      recipeImages,
      ingredientImages,
      cookingStepImages
    },
    skippedDuplicateCount
  };
}

function filterStepMediaToDeclaredImages(
  media: StepMedium[] | undefined,
  declaredRecipeImageIds: Set<string>
): StepMedium[] | undefined {
  if (!media?.length) return media;
  const next = media
    .map((medium) => {
      if (medium.type === "image" && !declaredRecipeImageIds.has(medium.imageId)) {
        return null;
      }
      return medium;
    })
    .filter((m): m is StepMedium => m != null);
  return next.length ? next : undefined;
}

/** Retire les références d’images recette absentes du fichier (export léger ou incomplet). */
export function stripUndeclaredRecipeImageRefs(recipes: Recipe[], declaredRecipeImageIds: Set<string>): Recipe[] {
  return recipes.map((recipe) => ({
    ...recipe,
    imageId: recipe.imageId && declaredRecipeImageIds.has(recipe.imageId) ? recipe.imageId : undefined,
    sourceImageIds: recipe.sourceImageIds?.filter((id) => declaredRecipeImageIds.has(id)),
    steps: recipe.steps.map((step: InstructionStep) => ({
      ...step,
      media: filterStepMediaToDeclaredImages(step.media, declaredRecipeImageIds)
    }))
  }));
}

/** Retire les `imageId` d’ingrédient absents du fichier (icônes régénérables à la lecture). */
export function stripUndeclaredIngredientImageRefs(
  recipes: Recipe[],
  declaredIngredientImageIds: Set<string>
): Recipe[] {
  return recipes.map((recipe) => ({
    ...recipe,
    ingredients: recipe.ingredients.map((ing) => ({
      ...ing,
      imageId: ing.imageId && declaredIngredientImageIds.has(ing.imageId) ? ing.imageId : undefined
    }))
  }));
}

/** Retire toutes les références aux images recette (export archive légère). */
export function stripAllRecipeImageRefsFromRecipes(recipes: Recipe[]): Recipe[] {
  return recipes.map((recipe) => ({
    ...recipe,
    imageId: undefined,
    sourceImageIds: undefined,
    steps: recipe.steps.map((step) => ({
      ...step,
      media: step.media?.filter((m) => m.type !== "image")
    }))
  }));
}

/** Retire tous les `imageId` d’ingrédients (icônes régénérables après import). */
export function stripAllIngredientImageRefsFromRecipes(recipes: Recipe[]): Recipe[] {
  return recipes.map((recipe) => ({
    ...recipe,
    ingredients: recipe.ingredients.map((ing) => ({
      ...ing,
      imageId: undefined
    }))
  }));
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

/** Parse et valide la structure minimale d’une archive (v1, v2 ou v3). */
export function parseRecipeBookExport(text: string): RecipeBookExportPayload {
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
    throw new RecipeBookImportError("Ce fichier n’est pas une archive Cookies & Coquilettes.");
  }
  const ver = obj.version;
  if (ver !== 1 && ver !== 2 && ver !== RECIPE_BOOK_EXPORT_VERSION) {
    throw new RecipeBookImportError(`Version d’archive non supportée : ${String(ver)}.`);
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
  return obj as unknown as RecipeBookExportPayload;
}

/** @deprecated utiliser parseRecipeBookExport */
export function parseRecipeBookExportV1(text: string): RecipeBookExportPayload {
  return parseRecipeBookExport(text);
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
 * (aucune collision avec une base existante). Les lignes `recipeImages` ne
 * doivent contenir que des entrées **inline** (`dataBase64`) ; les références
 * BFF doivent être développées avant l’appel.
 */
export function prepareImportFromExportV1(payload: RecipeBookExportPayload): {
  recipes: Recipe[];
  recipeImageRows: Array<RecipeImage & { blob: Blob }>;
  ingredientImageRows: Array<IngredientImage & { blob: Blob }>;
  cookingStepImageRows: Array<CookingStepImage & { blob: Blob }>;
} {
  for (const row of payload.recipeImages) {
    if (isRecipeImageRowBffRef(row)) {
      throw new RecipeBookImportError(
        "Archive interne invalide : image recette par clé BFF non développée avant import."
      );
    }
  }

  const declaredRecipeImageIds = new Set(payload.recipeImages.map((r) => r.id));
  const declaredIngredientImageIds = new Set(payload.ingredientImages.map((r) => r.id));

  let recipesIn = stripUndeclaredIngredientImageRefs(payload.recipes, declaredIngredientImageIds);
  recipesIn = stripUndeclaredRecipeImageRefs(recipesIn, declaredRecipeImageIds);

  const recipeIdMap = new Map<string, string>();
  for (const r of recipesIn) {
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

  for (const recipe of recipesIn) {
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

  const recipes: Recipe[] = recipesIn.map((r) => {
    const newId = recipeIdMap.get(r.id)!;
    const withImages = remapRecipeImageRefs(r, recipeImageIdMap, ingredientImageIdMap);
    return { ...withImages, id: newId };
  });

  const recipeImageRows: Array<RecipeImage & { blob: Blob }> = payload.recipeImages.map((row) => {
    const newId = recipeImageIdMap.get(row.id)!;
    const inline = row as Extract<RecipeBookRecipeImageRowExport, { dataBase64: string }>;
    const blob = base64ToBlob(inline.dataBase64, inline.mimeType);
    return {
      id: newId,
      mimeType: inline.mimeType,
      sizeBytes: inline.sizeBytes,
      createdAt: inline.createdAt,
      width: inline.width,
      height: inline.height,
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
