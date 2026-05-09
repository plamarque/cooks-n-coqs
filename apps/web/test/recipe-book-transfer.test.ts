import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@cookies-et-coquilettes/domain";
import {
  RECIPE_BOOK_FORMAT,
  RECIPE_BOOK_VERSION,
  base64ToBlob,
  collectIngredientImageIdsFromRecipes,
  collectRecipeImageIdsFromRecipes,
  newImportTransferId,
  parseRecipeBookExportV1,
  prepareImportFromExportV1,
  type RecipeBookExportV1
} from "../src/services/recipe-book-transfer-core";

const tinyGifB64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function minimalRecipe(overrides: Partial<Recipe> = {}): Recipe {
  const now = new Date().toISOString();
  return {
    id: "recipe-orig",
    title: "Salade",
    category: "SALE",
    favorite: false,
    ingredients: [
      {
        id: "ing-1",
        label: "Tomate",
        isScalable: false,
        imageId: "ing-img-orig"
      }
    ],
    steps: [
      {
        id: "step-1",
        order: 1,
        text: "Couper",
        media: [
          { type: "image", imageId: "step-img-orig" },
          { type: "video", url: "https://example.com/v" }
        ]
      }
    ],
    imageId: "main-img-orig",
    sourceImageIds: ["src-img-orig"],
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function minimalExport(overrides: Partial<RecipeBookExportV1> = {}): RecipeBookExportV1 {
  const r = minimalRecipe();
  const imgRow = (id: string) => ({
    id,
    mimeType: "image/gif",
    sizeBytes: 42,
    createdAt: r.createdAt,
    dataBase64: tinyGifB64
  });
  return {
    format: RECIPE_BOOK_FORMAT,
    version: RECIPE_BOOK_VERSION,
    exportedAt: r.createdAt,
    recipes: [r],
    recipeImages: ["main-img-orig", "src-img-orig", "step-img-orig"].map(imgRow),
    ingredientImages: [imgRow("ing-img-orig")],
    cookingStepImages: [
      {
        id: "cook-step-row-1",
        recipeId: "recipe-orig",
        stepId: "step-1",
        mimeType: "image/gif",
        sizeBytes: 42,
        createdAt: r.createdAt,
        dataBase64: tinyGifB64
      }
    ],
    ...overrides
  };
}

test("newImportTransferId returns a UUID v4-shaped string", () => {
  const id = newImportTransferId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("collectRecipeImageIdsFromRecipes gathers main, source and step image ids", () => {
  const r = minimalRecipe();
  const set = collectRecipeImageIdsFromRecipes([r]);
  assert.deepEqual(
    [...set].sort(),
    ["main-img-orig", "src-img-orig", "step-img-orig"].sort()
  );
});

test("collectIngredientImageIdsFromRecipes gathers ingredient image ids", () => {
  const set = collectIngredientImageIdsFromRecipes([minimalRecipe()]);
  assert.deepEqual([...set], ["ing-img-orig"]);
});

test("parseRecipeBookExportV1 rejects invalid JSON", () => {
  assert.throws(() => parseRecipeBookExportV1("{"), /JSON/);
});

test("parseRecipeBookExportV1 rejects wrong format magic", () => {
  const bad = JSON.stringify({ format: "other", version: 1, exportedAt: "", recipes: [], recipeImages: [], ingredientImages: [], cookingStepImages: [] });
  assert.throws(() => parseRecipeBookExportV1(bad), /Cookies/);
});

test("parseRecipeBookExportV1 accepts a valid v1 payload", () => {
  const raw = JSON.stringify(minimalExport());
  const parsed = parseRecipeBookExportV1(raw);
  assert.equal(parsed.recipes.length, 1);
  assert.equal(parsed.recipeImages.length, 3);
});

test("prepareImportFromExportV1 assigns new recipe and image ids", () => {
  const payload = minimalExport();
  const { recipes, recipeImageRows, ingredientImageRows, cookingStepImageRows } =
    prepareImportFromExportV1(payload);

  assert.equal(recipes.length, 1);
  assert.notEqual(recipes[0]!.id, "recipe-orig");
  assert.equal(recipeImageRows.length, 3);
  const newMain = recipes[0]!.imageId;
  assert.ok(newMain);
  assert.notEqual(newMain, "main-img-orig");
  assert.ok(recipes[0]!.sourceImageIds?.every((id) => id !== "src-img-orig"));
  const stepMedia = recipes[0]!.steps[0]!.media;
  assert.equal(stepMedia?.[0]?.type, "image");
  if (stepMedia?.[0]?.type === "image") {
    assert.notEqual(stepMedia[0].imageId, "step-img-orig");
  }
  assert.equal(stepMedia?.[1]?.type, "video");
  assert.notEqual(ingredientImageRows[0]!.id, "ing-img-orig");
  assert.equal(ingredientImageRows[0]!.blob.size, base64ToBlob(tinyGifB64, "image/gif").size);
  assert.equal(cookingStepImageRows.length, 1);
  assert.equal(cookingStepImageRows[0]!.recipeId, recipes[0]!.id);
  assert.equal(cookingStepImageRows[0]!.stepId, "step-1");
});

test("prepareImportFromExportV1 throws when a referenced recipe image is missing from archive", () => {
  const payload = minimalExport({
    recipeImages: [
      {
        id: "main-img-orig",
        mimeType: "image/gif",
        sizeBytes: 1,
        createdAt: minimalRecipe().createdAt,
        dataBase64: tinyGifB64
      }
    ]
  });
  assert.throws(() => prepareImportFromExportV1(payload), /image recette/);
});

test("prepareImportFromExportV1 throws when ingredient image is missing from archive", () => {
  const r = minimalRecipe({ ingredients: [{ id: "i", label: "L", isScalable: false, imageId: "missing-ing" }] });
  const imgRow = (id: string) => ({
    id,
    mimeType: "image/gif",
    sizeBytes: 1,
    createdAt: r.createdAt,
    dataBase64: tinyGifB64
  });
  const payload: RecipeBookExportV1 = {
    format: RECIPE_BOOK_FORMAT,
    version: RECIPE_BOOK_VERSION,
    exportedAt: r.createdAt,
    recipes: [r],
    recipeImages: ["main-img-orig", "src-img-orig", "step-img-orig"].map(imgRow),
    ingredientImages: [],
    cookingStepImages: []
  };
  assert.throws(() => prepareImportFromExportV1(payload), /image ingrédient/);
});
