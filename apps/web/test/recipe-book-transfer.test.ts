import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@cookies-et-coquilettes/domain";
import {
  RECIPE_BOOK_FORMAT,
  RECIPE_BOOK_EXPORT_VERSION,
  base64ToBlob,
  collectIngredientImageIdsFromRecipes,
  collectRecipeImageIdsFromRecipes,
  newImportTransferId,
  parseRecipeBookExport,
  parseRecipeBookExportV1,
  prepareImportFromExportV1,
  shouldRehydrateRecipeMediaAfterImport,
  stripAllIngredientImageRefsFromRecipes,
  stripAllRecipeImageRefsFromRecipes,
  stripUndeclaredIngredientImageRefs,
  stripUndeclaredRecipeImageRefs,
  filterRecipeBookExportPayloadForDedup,
  type RecipeBookExportPayload
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

function minimalExport(overrides: Partial<RecipeBookExportPayload> = {}): RecipeBookExportPayload {
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
    version: 1,
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

test("parseRecipeBookExport rejects invalid JSON", () => {
  assert.throws(() => parseRecipeBookExport("{"), /JSON/);
});

test("parseRecipeBookExport rejects wrong format magic", () => {
  const bad = JSON.stringify({
    format: "other",
    version: 1,
    exportedAt: "",
    recipes: [],
    recipeImages: [],
    ingredientImages: [],
    cookingStepImages: []
  });
  assert.throws(() => parseRecipeBookExport(bad), /Cookies/);
});

test("parseRecipeBookExport rejects unsupported version", () => {
  const bad = JSON.stringify({
    format: RECIPE_BOOK_FORMAT,
    version: 99,
    exportedAt: "x",
    recipes: [],
    recipeImages: [],
    ingredientImages: [],
    cookingStepImages: []
  });
  assert.throws(() => parseRecipeBookExport(bad), /non supportée/);
});

test("parseRecipeBookExport accepts v1, v2 and v3 payloads", () => {
  const v1 = JSON.stringify(minimalExport());
  assert.equal(parseRecipeBookExport(v1).version, 1);

  const r = minimalRecipe();
  const imgRow = (id: string) => ({
    id,
    mimeType: "image/gif",
    sizeBytes: 42,
    createdAt: r.createdAt,
    dataBase64: tinyGifB64
  });
  const v2 = JSON.stringify({
    format: RECIPE_BOOK_FORMAT,
    version: 2,
    exportedAt: r.createdAt,
    exportProfile: {
      includeIngredientImages: false,
      includeCookingStepImages: false,
      includeRecipeImages: true
    },
    recipes: [r],
    recipeImages: ["main-img-orig", "src-img-orig", "step-img-orig"].map(imgRow),
    ingredientImages: [],
    cookingStepImages: []
  });
  assert.equal(parseRecipeBookExport(v2).version, 2);

  const v3 = JSON.stringify({
    format: RECIPE_BOOK_FORMAT,
    version: RECIPE_BOOK_EXPORT_VERSION,
    exportedAt: r.createdAt,
    exportProfile: {
      includeIngredientImages: false,
      includeCookingStepImages: false,
      includeRecipeImages: false
    },
    recipes: [r],
    recipeImages: [],
    ingredientImages: [],
    cookingStepImages: []
  });
  assert.equal(parseRecipeBookExport(v3).version, RECIPE_BOOK_EXPORT_VERSION);
});

test("shouldRehydrateRecipeMediaAfterImport is true for v3 and all-off v2", () => {
  const r = minimalRecipe();
  const slimV2: RecipeBookExportPayload = {
    format: RECIPE_BOOK_FORMAT,
    version: 2,
    exportedAt: r.createdAt,
    exportProfile: {
      includeIngredientImages: false,
      includeCookingStepImages: false,
      includeRecipeImages: false
    },
    recipes: [r],
    recipeImages: [],
    ingredientImages: [],
    cookingStepImages: []
  };
  assert.equal(shouldRehydrateRecipeMediaAfterImport(slimV2), true);

  const v3: RecipeBookExportPayload = {
    ...slimV2,
    version: RECIPE_BOOK_EXPORT_VERSION
  };
  assert.equal(shouldRehydrateRecipeMediaAfterImport(v3), true);

  const fullV1 = minimalExport();
  assert.equal(shouldRehydrateRecipeMediaAfterImport(fullV1), false);
});

test("filterRecipeBookExportPayloadForDedup skips duplicate stable keys", () => {
  const a = minimalRecipe({ id: "a", title: "A", importSourceStableKey: "k1" });
  const b = minimalRecipe({ id: "b", title: "B", importSourceStableKey: "k1" });
  const c = minimalRecipe({ id: "c", title: "C", importSourceStableKey: "k2" });
  const payload: RecipeBookExportPayload = {
    format: RECIPE_BOOK_FORMAT,
    version: RECIPE_BOOK_EXPORT_VERSION,
    exportedAt: a.createdAt,
    recipes: [a, b, c],
    recipeImages: [],
    ingredientImages: [],
    cookingStepImages: []
  };
  const first = filterRecipeBookExportPayloadForDedup(payload, ["k1", "k1", "k2"], new Set());
  assert.equal(first.skippedDuplicateCount, 1);
  assert.equal(first.payload.recipes.length, 2);
  assert.equal(first.payload.recipes[0]!.id, "a");
  assert.equal(first.payload.recipes[1]!.id, "c");

  const second = filterRecipeBookExportPayloadForDedup(
    payload,
    ["k1", "k1", "k2"],
    new Set(["k2"])
  );
  assert.equal(second.skippedDuplicateCount, 2);
  assert.equal(second.payload.recipes.length, 1);
  assert.equal(second.payload.recipes[0]!.id, "a");
});

test("stripAllRecipeImageRefsFromRecipes and stripAllIngredientImageRefsFromRecipes", () => {
  const r = minimalRecipe();
  const strippedImg = stripAllRecipeImageRefsFromRecipes([r])[0]!;
  assert.equal(strippedImg.imageId, undefined);
  assert.equal(strippedImg.sourceImageIds, undefined);
  const media = strippedImg.steps[0]!.media ?? [];
  assert.equal(media.length, 1);
  assert.equal(media[0]!.type, "video");

  const strippedIng = stripAllIngredientImageRefsFromRecipes([strippedImg])[0]!;
  assert.equal(strippedIng.ingredients[0]!.imageId, undefined);
});

test("parseRecipeBookExportV1 alias still works", () => {
  const raw = JSON.stringify(minimalExport());
  assert.equal(parseRecipeBookExportV1(raw).recipes.length, 1);
});

test("stripUndeclaredRecipeImageRefs removes missing image references", () => {
  const r = minimalRecipe();
  const [next] = stripUndeclaredRecipeImageRefs([r], new Set(["main-img-orig"]));
  assert.equal(next.imageId, "main-img-orig");
  assert.equal(next.sourceImageIds?.length ?? 0, 0);
  const media = next.steps[0]!.media ?? [];
  assert.equal(media.length, 1);
  assert.equal(media[0]!.type, "video");
});

test("stripUndeclaredIngredientImageRefs removes missing ingredient icons", () => {
  const r = minimalRecipe();
  const [next] = stripUndeclaredIngredientImageRefs([r], new Set());
  assert.equal(next.ingredients[0]!.imageId, undefined);
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

test("prepareImportFromExportV1 strips missing recipe images then imports", () => {
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
  const { recipes, recipeImageRows, cookingStepImageRows } = prepareImportFromExportV1(payload);
  assert.equal(recipeImageRows.length, 1);
  assert.equal(recipes[0]!.imageId, recipeImageRows[0]!.id);
  assert.equal(recipes[0]!.sourceImageIds?.length ?? 0, 0);
  const media = recipes[0]!.steps[0]!.media ?? [];
  assert.equal(media.length, 1);
  assert.equal(media[0]!.type, "video");
  assert.equal(cookingStepImageRows.length, 1);
});

test("prepareImportFromExportV1 strips missing ingredient images then imports", () => {
  const r = minimalRecipe({ ingredients: [{ id: "i", label: "L", isScalable: false, imageId: "missing-ing" }] });
  const imgRow = (id: string) => ({
    id,
    mimeType: "image/gif",
    sizeBytes: 1,
    createdAt: r.createdAt,
    dataBase64: tinyGifB64
  });
  const payload: RecipeBookExportPayload = {
    format: RECIPE_BOOK_FORMAT,
    version: 1,
    exportedAt: r.createdAt,
    recipes: [r],
    recipeImages: ["main-img-orig", "src-img-orig", "step-img-orig"].map(imgRow),
    ingredientImages: [],
    cookingStepImages: []
  };
  const { recipes, ingredientImageRows } = prepareImportFromExportV1(payload);
  assert.equal(ingredientImageRows.length, 0);
  assert.equal(recipes[0]!.ingredients[0]!.imageId, undefined);
});
