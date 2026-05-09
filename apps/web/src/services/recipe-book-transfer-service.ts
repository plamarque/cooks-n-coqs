import type { Recipe } from "@cookies-et-coquilettes/domain";
import { db } from "../storage/db";
import { dexieRecipeService } from "./recipe-service";
import {
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
import { rehydrateRecipeMediaAfterArchiveImport } from "./recipe-book-rehydrate-after-import";
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
  onRow?: (processed: number, total: number) => void
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
    onRow?.(i, total);
  }
  return { ...payload, recipeImages: nextRows };
}

/** Export JSON version 3 : texte et structure uniquement (pas de blobs ni refs images locales). */
export async function exportRecipeBookJson(recipes: Recipe[]): Promise<string> {
  let recipesOut = cloneRecipesForExport(recipes);
  recipesOut = stripAllRecipeImageRefsFromRecipes(recipesOut);
  recipesOut = stripAllIngredientImageRefsFromRecipes(recipesOut);

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

/** Import depuis un fichier .zip uniquement (décompression puis même pipeline que `importRecipeBookFromJson`). */
export async function importRecipeBookFromZipFile(
  file: File,
  onProgress?: RecipeBookTransferProgressCallback
): Promise<{ importedCount: number }> {
  assertZipArchiveFile(file);
  onProgress?.(2, "Lecture du fichier…");
  const buf = new Uint8Array(await file.arrayBuffer());
  onProgress?.(6, "Décompression…");
  const text = unzipRecipeBookJson(buf);
  const mapInner = (pct: number, stage: string) => {
    onProgress?.(6 + Math.round((pct / 100) * 94), stage);
  };
  return importRecipeBookFromJson(text, { onProgress: mapInner });
}

export interface RecipeBookJsonImportOptions {
  onProgress?: RecipeBookTransferProgressCallback;
}

export async function importRecipeBookFromJson(
  text: string,
  options?: RecipeBookJsonImportOptions
): Promise<{ importedCount: number }> {
  const onProgress = options?.onProgress;
  onProgress?.(8, "Analyse de l’archive…");
  let payload = parseRecipeBookExport(text);
  if (payload.recipes.length === 0) {
    onProgress?.(100, "Aucune recette dans le fichier");
    return { importedCount: 0 };
  }

  const runRehydrate = shouldRehydrateRecipeMediaAfterImport(payload);

  payload = await expandBffRecipeImageRowsInPayload(payload, (done, total) => {
    const span = 34;
    const base = 12;
    const frac = total > 0 ? done / total : 1;
    onProgress?.(base + Math.round(frac * span), "Téléchargement des images distantes…");
  });

  onProgress?.(48, "Préparation de l’import…");
  const { recipes, recipeImageRows, ingredientImageRows, cookingStepImageRows } =
    prepareImportFromExportV1(payload);

  onProgress?.(52, "Écriture locale…");
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
      for (const recipe of recipes) {
        await dexieRecipeService.createRecipe(recipe);
      }
      for (const row of cookingStepImageRows) {
        await db.cookingStepImages.add(row);
      }
    }
  );

  onProgress?.(56, "Enregistrement terminé");

  if (runRehydrate && recipes.length > 0) {
    onProgress?.(58, "Mise à jour des visuels (images)…");
    const n = recipes.length;
    for (let i = 0; i < n; i++) {
      const recipe = recipes[i]!;
      try {
        await rehydrateRecipeMediaAfterArchiveImport(recipe.id);
      } catch {
        /* erreurs réseau / BFF : l’import reste valide */
      }
      onProgress?.(
        58 + Math.floor((41 * (i + 1)) / n),
        `Images : recette ${i + 1} / ${n}…`
      );
    }
  } else {
    onProgress?.(92, "Finalisation…");
  }

  onProgress?.(100, "Terminé");
  return { importedCount: recipes.length };
}
