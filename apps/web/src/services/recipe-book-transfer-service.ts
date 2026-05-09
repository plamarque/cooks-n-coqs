import type { Recipe } from "@cookies-et-coquilettes/domain";
import { db } from "../storage/db";
import { dexieRecipeService } from "./recipe-service";
import {
  collectIngredientImageIdsFromRecipes,
  collectRecipeImageIdsFromRecipes,
  parseRecipeBookExportV1,
  prepareImportFromExportV1,
  RECIPE_BOOK_FORMAT,
  RECIPE_BOOK_VERSION,
  type RecipeBookExportV1,
  type RecipeBookImageRowExport,
  type RecipeBookIngredientImageRowExport,
  type RecipeBookCookingStepImageRowExport
} from "./recipe-book-transfer-core";

export {
  RECIPE_BOOK_FORMAT,
  RECIPE_BOOK_VERSION,
  RecipeBookImportError,
  base64ToBlob,
  collectIngredientImageIdsFromRecipes,
  collectRecipeImageIdsFromRecipes,
  parseRecipeBookExportV1,
  prepareImportFromExportV1,
  type RecipeBookExportV1,
  type RecipeBookImageRowExport,
  type RecipeBookIngredientImageRowExport,
  type RecipeBookCookingStepImageRowExport
} from "./recipe-book-transfer-core";

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export async function exportRecipeBookJson(recipes: Recipe[]): Promise<string> {
  const recipeImageIdSet = collectRecipeImageIdsFromRecipes(recipes);
  const ingredientImageIdSet = collectIngredientImageIdsFromRecipes(recipes);
  const recipeIds = new Set(recipes.map((r) => r.id));

  const recipeImages: RecipeBookImageRowExport[] = [];
  for (const id of recipeImageIdSet) {
    const row = await db.images.get(id);
    if (!row?.blob) {
      throw new Error(`Image recette manquante en base : ${id}`);
    }
    const { blob, ...meta } = row;
    const dataBase64 = await blobToBase64(blob);
    recipeImages.push({
      id: meta.id,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      createdAt: meta.createdAt,
      width: meta.width,
      height: meta.height,
      dataBase64
    });
  }

  const ingredientImages: RecipeBookIngredientImageRowExport[] = [];
  for (const id of ingredientImageIdSet) {
    const row = await db.ingredientImages.get(id);
    if (!row?.blob) {
      throw new Error(`Image ingrédient manquante en base : ${id}`);
    }
    const { blob, ...meta } = row;
    const dataBase64 = await blobToBase64(blob);
    ingredientImages.push({
      id: meta.id,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      createdAt: meta.createdAt,
      width: meta.width,
      height: meta.height,
      dataBase64
    });
  }

  const cookingStepRows = await db.cookingStepImages
    .filter((row) => recipeIds.has(row.recipeId))
    .toArray();

  const cookingStepImages: RecipeBookCookingStepImageRowExport[] = [];
  for (const row of cookingStepRows) {
    if (!row.blob) continue;
    const { blob, ...meta } = row;
    const dataBase64 = await blobToBase64(blob);
    cookingStepImages.push({
      id: meta.id,
      recipeId: meta.recipeId,
      stepId: meta.stepId,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      createdAt: meta.createdAt,
      dataBase64
    });
  }

  const payload: RecipeBookExportV1 = {
    format: RECIPE_BOOK_FORMAT,
    version: RECIPE_BOOK_VERSION,
    exportedAt: new Date().toISOString(),
    recipes,
    recipeImages,
    ingredientImages,
    cookingStepImages
  };

  return JSON.stringify(payload);
}

export async function importRecipeBookFromJson(text: string): Promise<{ importedCount: number }> {
  const payload = parseRecipeBookExportV1(text);
  if (payload.recipes.length === 0) {
    return { importedCount: 0 };
  }

  const { recipes, recipeImageRows, ingredientImageRows, cookingStepImageRows } =
    prepareImportFromExportV1(payload);

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

  return { importedCount: recipes.length };
}
