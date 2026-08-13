import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@cookies-et-coquilettes/domain";
import {
  RECIPE_SHARE_F2_CTA,
  buildRecipeShareF2Text,
  formatIngredientLineForShare
} from "../src/utils/recipe-share-f2";

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    title: "Tiramisu",
    category: "SUCRE",
    favorite: false,
    servingsBase: 6,
    ingredients: [
      {
        id: "i1",
        order: 1,
        label: "mascarpone",
        quantity: 500,
        quantityBase: 500,
        unit: "g",
        isScalable: true
      },
      {
        id: "i2",
        order: 2,
        label: "œufs",
        quantity: 4,
        quantityBase: 4,
        unit: "",
        isScalable: true,
        rawText: "4 œufs"
      }
    ],
    steps: [
      { id: "s2", order: 2, text: "Incorporer le mascarpone." },
      { id: "s1", order: 1, text: "Séparer les blancs des jaunes." }
    ],
    source: {
      type: "URL",
      url: "https://example.com/tiramisu",
      capturedAt: "2026-01-01T00:00:00.000Z"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

test("formatIngredientLineForShare prefers rawText", () => {
  assert.equal(
    formatIngredientLineForShare({
      id: "x",
      label: "oeufs",
      quantity: 3,
      unit: "pièces",
      isScalable: true,
      rawText: "4 œufs"
    }),
    "4 œufs"
  );
});

test("formatIngredientLineForShare builds qty unit label", () => {
  assert.equal(
    formatIngredientLineForShare({
      id: "x",
      label: "mascarpone",
      quantity: 250,
      unit: "g",
      isScalable: true
    }),
    "250 g mascarpone"
  );
});

test("buildRecipeShareF2Text emits fixed headers, sorted steps, CTA last", () => {
  const text = buildRecipeShareF2Text(baseRecipe());
  assert.equal(
    text,
    [
      "Titre:",
      "Tiramisu",
      "",
      "Portions:",
      "6",
      "",
      "Ingrédients:",
      "- 500 g mascarpone",
      "- 4 œufs",
      "",
      "Étapes:",
      "1. Séparer les blancs des jaunes.",
      "2. Incorporer le mascarpone.",
      "",
      "Source:",
      "https://example.com/tiramisu",
      "",
      RECIPE_SHARE_F2_CTA
    ].join("\n")
  );
});

test("buildRecipeShareF2Text omits Portions and Source when absent", () => {
  const text = buildRecipeShareF2Text(
    baseRecipe({
      servingsBase: undefined,
      source: { type: "MANUAL", capturedAt: "2026-01-01T00:00:00.000Z" }
    })
  );
  assert.ok(!text.includes("Portions:"));
  assert.ok(!text.includes("Source:"));
  assert.ok(text.startsWith("Titre:\nTiramisu\n\nIngrédients:"));
  assert.ok(text.endsWith(RECIPE_SHARE_F2_CTA));
});

test("buildRecipeShareF2Text omits non-http Source", () => {
  const text = buildRecipeShareF2Text(
    baseRecipe({
      source: {
        type: "TEXT",
        url: "not-a-url",
        capturedAt: "2026-01-01T00:00:00.000Z"
      }
    })
  );
  assert.ok(!text.includes("Source:"));
});

test("buildRecipeShareF2Text CTA is exactly one trailing line", () => {
  const text = buildRecipeShareF2Text(baseRecipe({ servingsBase: undefined, source: undefined }));
  const lines = text.split("\n");
  assert.equal(lines[lines.length - 1], RECIPE_SHARE_F2_CTA);
  assert.equal(lines.filter((l) => l.startsWith("Tu veux garder")).length, 1);
});
