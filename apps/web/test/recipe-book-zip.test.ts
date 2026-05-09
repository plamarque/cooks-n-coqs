import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { RECIPE_BOOK_FORMAT, RecipeBookImportError } from "../src/services/recipe-book-transfer-core";
import { RECIPE_BOOK_ZIP_ENTRY, unzipRecipeBookJson, zipRecipeBookJson } from "../src/utils/recipe-book-zip";

const minimalJson = `{"format":"${RECIPE_BOOK_FORMAT}","version":3,"exportedAt":"2020-01-01T00:00:00.000Z","recipes":[],"recipeImages":[],"ingredientImages":[],"cookingStepImages":[]}`;

test("zip round-trip preserves JSON", () => {
  const zipped = zipRecipeBookJson(minimalJson);
  assert.ok(zipped.length > 0);
  const out = unzipRecipeBookJson(zipped);
  assert.equal(out, minimalJson);
});

test("unzip finds recipe-book.json in a subfolder", () => {
  const path = `export/${RECIPE_BOOK_ZIP_ENTRY}`;
  const nested = zipSync({ [path]: strToU8(minimalJson) });
  assert.equal(unzipRecipeBookJson(nested), minimalJson);
});

test("unzip falls back to first matching JSON entry", () => {
  const altName = zipSync({ "mon-cahier.json": strToU8(minimalJson) });
  assert.equal(unzipRecipeBookJson(altName), minimalJson);
});

test("unzip rejects invalid zip bytes", () => {
  assert.throws(
    () => unzipRecipeBookJson(new Uint8Array([1, 2, 3])),
    (e: unknown) => e instanceof RecipeBookImportError
  );
});
