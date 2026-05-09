import type { Recipe } from "@cookies-et-coquilettes/domain";
import { resolveImportSourceStableKey } from "@cookies-et-coquilettes/domain";
import { db } from "../storage/db";
import { dexieRecipeService } from "./recipe-service";
import {
  filterRecipeBookExportPayloadForDedup,
  isRecipeImageRowBffRef,
  parseRecipeBookExport,
  parseRecipeBookExportV1,
  prepareImportFromExportV1,
  RecipeBookImportError,
  RECIPE_BOOK_FORMAT,
  RECIPE_BOOK_EXPORT_VERSION,
  shouldRehydrateRecipeMediaAfterImport,
  stripAllIngredientImageRefsFromRecipes,
  stripAllRecipeImageRefsFromRecipes,
  type RecipeBookExportPayload,
  type RecipeBookRecipeImageRowExport
} from "./recipe-book-transfer-core";
import { unzipRecipeBookJson, zipRecipeBookJson } from "../utils/recipe-book-zip";

export {
  RECIPE_BOOK_FORMAT,
  RECIPE_BOOK_VERSION,
  RECIPE_BOOK_EXPORT_VERSION,
  RecipeBookImportError,
  base64ToBlob,
  collectIngredientImageIdsFromRecipes,
  collectRecipeImageIdsFromRecipes,
  isRecipeImageRowBffRef,
  parseRecipeBookExport,
  parseRecipeBookExportV1,
  prepareImportFromExportV1,
  resolvedExportProfile,
  shouldRehydrateRecipeMediaAfterImport,
  stripAllIngredientImageRefsFromRecipes,
  stripAllRecipeImageRefsFromRecipes,
  stripUndeclaredIngredientImageRefs,
  stripUndeclaredRecipeImageRefs,
  filterRecipeBookExportPayloadForDedup,
  type RecipeBookExportPayload,
  type RecipeBookExportProfile,
  type RecipeBookExportV1,
  type RecipeBookImageRowExport,
  type RecipeBookIngredientImageRowExport,
  type RecipeBookCookingStepImageRowExport,
  type RecipeBookRecipeImageRowExport
} from "./recipe-book-transfer-core";

const BFF_URL = import.meta.env.VITE_BFF_URL || "http://localhost:8787";

/** `percent` entre 0 et 100 ; `stage` libellé court pour l’UI. */
export type RecipeBookTransferProgressCallback = (percent: number, stage: string) => void;

/** Titre affiché dans la barre d’import (évite les libellés trop longs). */
function formatRecipeTitleForProgress(title: string): string {
  const t = title.trim() || "Sans titre";
  return t.length > 72 ? `${t.slice(0, 69)}…` : t;
}

/** Première recette de l’archive qui référence cette image recette (photo, sources, étapes). */
function recipeTitleForRecipeImageId(
  payload: RecipeBookExportPayload,
  imageId: string
): string | undefined {
  for (const recipe of payload.recipes) {
    if (recipe.imageId === imageId) return formatRecipeTitleForProgress(recipe.title);
    if (recipe.sourceImageIds?.includes(imageId)) return formatRecipeTitleForProgress(recipe.title);
    for (const step of recipe.steps) {
      for (const m of step.media ?? []) {
        if (m.type === "image" && m.imageId === imageId) {
          return formatRecipeTitleForProgress(recipe.title);
        }
      }
    }
  }
  return undefined;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function cloneRecipesForExport(recipes: Recipe[]): Recipe[] {
  return JSON.parse(JSON.stringify(recipes)) as Recipe[];
}

/**
 * Remplace les lignes `bffGeneratedKey` par des entrées inline base64 (téléchargement BFF).
 */
export async function expandBffRecipeImageRowsInPayload(
  payload: RecipeBookExportPayload,
  onRow?: (processed: number, total: number, meta?: { recipeTitle?: string }) => void
): Promise<RecipeBookExportPayload> {
  const nextRows: RecipeBookRecipeImageRowExport[] = [];
  const total = payload.recipeImages.length;
  if (total === 0) {
    onRow?.(0, 0);
    return { ...payload, recipeImages: [] };
  }
  let i = 0;
  for (const row of payload.recipeImages) {
    if (isRecipeImageRowBffRef(row)) {
      const url = `${BFF_URL.replace(/\/+$/, "")}/api/generated-images/${encodeURIComponent(row.bffGeneratedKey)}`;
      const res = await fetch(url, { mode: "cors", signal: AbortSignal.timeout(60000) });
      if (!res.ok) {
        throw new RecipeBookImportError(
          `Image recette distante introuvable (clé BFF « ${row.bffGeneratedKey} ») : ${res.status}`
        );
      }
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) {
        throw new RecipeBookImportError("La réponse BFF pour l’image recette n’est pas une image.");
      }
      const dataBase64 = await blobToBase64(blob);
      nextRows.push({
        id: row.id,
        mimeType: blob.type || row.mimeType,
        sizeBytes: blob.size,
        createdAt: row.createdAt,
        width: row.width,
        height: row.height,
        dataBase64
      });
    } else {
      nextRows.push(row);
    }
    i += 1;
    const recipeTitle = recipeTitleForRecipeImageId(payload, row.id);
    onRow?.(i, total, recipeTitle ? { recipeTitle } : undefined);
  }
  return { ...payload, recipeImages: nextRows };
}

/** Export JSON version 3 : texte et structure uniquement (pas de blobs ni refs images locales). */
export async function exportRecipeBookJson(recipes: Recipe[]): Promise<string> {
  let recipesOut = cloneRecipesForExport(recipes);
  recipesOut = stripAllRecipeImageRefsFromRecipes(recipesOut);
  recipesOut = stripAllIngredientImageRefsFromRecipes(recipesOut);
  recipesOut = recipesOut.map(({ pendingBookMediaHydration: _ignored, ...r }) => r as Recipe);

  for (const r of recipesOut) {
    if (!r.importSourceStableKey?.trim()) {
      const key = await resolveImportSourceStableKey(r);
      if (key) {
        r.importSourceStableKey = key;
      }
    }
  }

  const payload: RecipeBookExportPayload = {
    format: RECIPE_BOOK_FORMAT,
    version: RECIPE_BOOK_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    exportProfile: {
      includeIngredientImages: false,
      includeCookingStepImages: false,
      includeRecipeImages: false
    },
    recipes: recipesOut,
    recipeImages: [],
    ingredientImages: [],
    cookingStepImages: []
  };

  return JSON.stringify(payload);
}

/** Export sous forme de fichier ZIP (même contenu JSON qu’`exportRecipeBookJson`, une entrée `recipe-book.json`). */
export async function exportRecipeBookZipBlob(
  recipes: Recipe[],
  onProgress?: RecipeBookTransferProgressCallback
): Promise<Blob> {
  onProgress?.(4, "Préparation des données…");
  const json = await exportRecipeBookJson(recipes);
  onProgress?.(35, "Compression ZIP…");
  const bytes = zipRecipeBookJson(json);
  onProgress?.(96, "Finalisation…");
  const blob = new Blob([Uint8Array.from(bytes)], { type: "application/zip" });
  onProgress?.(100, "Terminé");
  return blob;
}

function assertZipArchiveFile(file: File): void {
  const lower = file.name.toLowerCase();
  const looksZip =
    lower.endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed";
  if (!looksZip) {
    throw new RecipeBookImportError(
      "Sélectionnez un fichier .zip exporté depuis Cookies & Coquillettes (l’import JSON seul n’est plus pris en charge)."
    );
  }
}

export interface RecipeBookZipImportOptions {
  onProgress?: RecipeBookTransferProgressCallback;
}

/** Import depuis un fichier .zip uniquement (décompression puis même pipeline que `importRecipeBookFromJson`). */
export async function importRecipeBookFromZipFile(
  file: File,
  options?: RecipeBookZipImportOptions
): Promise<{ importedCount: number; slimArchiveMedia: boolean; skippedDuplicateCount: number }> {
  assertZipArchiveFile(file);
  const onProgress = options?.onProgress;
  onProgress?.(2, "Lecture du fichier…");
  const buf = new Uint8Array(await file.arrayBuffer());
  onProgress?.(6, "Décompression…");
  const text = unzipRecipeBookJson(buf);
  const mapInner = (pct: number, stage: string) => {
    onProgress?.(6 + Math.round((pct / 100) * 94), stage);
  };
  return importRecipeBookFromJson(text, {
    onProgress: mapInner
  });
}

export interface RecipeBookJsonImportOptions {
  onProgress?: RecipeBookTransferProgressCallback;
}

export async function importRecipeBookFromJson(
  text: string,
  options?: RecipeBookJsonImportOptions
): Promise<{
  importedCount: number;
  slimArchiveMedia: boolean;
  skippedDuplicateCount: number;
}> {
  const onProgress = options?.onProgress;
  onProgress?.(8, "Analyse de l’archive…");
  let payload = parseRecipeBookExport(text);
  if (payload.recipes.length === 0) {
    onProgress?.(100, "Aucune recette dans le fichier");
    return { importedCount: 0, slimArchiveMedia: false, skippedDuplicateCount: 0 };
  }

  onProgress?.(10, "Vérification des doublons…");
  const stableKeyByRecipeIndex = await Promise.all(
    payload.recipes.map((r) => resolveImportSourceStableKey(r))
  );
  const existingList = await dexieRecipeService.listRecipes();
  const existingStableKeys = new Set(
    existingList
      .map((r) => r.importSourceStableKey?.trim())
      .filter((k): k is string => Boolean(k))
  );
  const deduped = filterRecipeBookExportPayloadForDedup(
    payload,
    stableKeyByRecipeIndex,
    existingStableKeys
  );
  payload = deduped.payload;
  const skippedDuplicateCount = deduped.skippedDuplicateCount;

  if (payload.recipes.length === 0) {
    onProgress?.(100, "Aucune recette nouvelle (toutes étaient déjà importées).");
    return { importedCount: 0, slimArchiveMedia: false, skippedDuplicateCount };
  }

  const runRehydrate = shouldRehydrateRecipeMediaAfterImport(payload);

  payload = await expandBffRecipeImageRowsInPayload(payload, (done, total, meta) => {
    const span = 34;
    const base = 12;
    const frac = total > 0 ? done / total : 1;
    const pct = base + Math.round(frac * span);
    const title = meta?.recipeTitle;
    onProgress?.(
      pct,
      title
        ? `Téléchargement des images — ${title} (${done}/${total})`
        : `Téléchargement des images distantes… (${done}/${total})`
    );
  });

  onProgress?.(48, "Préparation de l’import…");
  let { recipes, recipeImageRows, ingredientImageRows, cookingStepImageRows } =
    prepareImportFromExportV1(payload);
  if (runRehydrate && recipes.length > 0) {
    recipes = recipes.map((r) => ({ ...r, pendingBookMediaHydration: true }));
  }

  onProgress?.(52, "Écriture locale…");
  const nRecipes = recipes.length;
  await db.transaction(
    "rw",
    db.recipes,
    db.images,
    db.ingredientImages,
    db.cookingStepImages,
    async () => {
      for (const row of recipeImageRows) {
        await db.images.add(row);
      }
      for (const row of ingredientImageRows) {
        await db.ingredientImages.add(row);
      }
      for (let ri = 0; ri < recipes.length; ri++) {
        const recipe = recipes[ri]!;
        const label = formatRecipeTitleForProgress(recipe.title);
        const pct =
          nRecipes > 0 ? 52 + Math.round(((ri + 0.5) / nRecipes) * 4) : 54;
        onProgress?.(
          pct,
          nRecipes > 1
            ? `Import de la recette (${ri + 1}/${nRecipes}) : ${label}`
            : `Import de la recette : ${label}`
        );
        await dexieRecipeService.createRecipe(recipe);
      }
      for (const row of cookingStepImageRows) {
        await db.cookingStepImages.add(row);
      }
    }
  );

  onProgress?.(56, "Enregistrement terminé");
  onProgress?.(92, "Finalisation…");
  onProgress?.(100, "Terminé");
  return {
    importedCount: recipes.length,
    slimArchiveMedia: runRehydrate,
    skippedDuplicateCount
  };
}
