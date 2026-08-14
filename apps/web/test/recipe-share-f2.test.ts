import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@cookies-et-coquilettes/domain";
import {
  RECIPE_SHARE_F2_CTA,
  buildRecipeShareF2Text,
  formatIngredientLineForShare,
  tryParseRecipeShareF2Text
} from "../src/utils/recipe-share-f2";

/** Payload exact — preview-messagerie-tiramisu.md */
const TIRAMISU_F2_TEXT = [
  "Titre:",
  "Tiramisu",
  "",
  "Portions:",
  "6",
  "",
  "Ingrédients:",
  "- 500 g mascarpone",
  "- 4 œufs",
  "- 100 g sucre",
  "- 24 biscuits à la cuillère",
  "- 30 cl café serré",
  "- 2 c.à.s cacao amer",
  "",
  "Étapes:",
  "1. Séparer les blancs des jaunes.",
  "2. Blanchir les jaunes avec le sucre.",
  "3. Incorporer le mascarpone.",
  "4. Monter les blancs en neige et plier.",
  "5. Tremper les biscuits dans le café, alterner couches.",
  "6. Saupoudrer de cacao et réserver au frais 4 h.",
  "",
  "Source:",
  "https://example.com/tiramisu",
  "",
  RECIPE_SHARE_F2_CTA
].join("\n");

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

test("tryParseRecipeShareF2Text — Tiramisu fixture exacte", () => {
  const draft = tryParseRecipeShareF2Text(TIRAMISU_F2_TEXT);
  assert.ok(draft);
  assert.equal(draft.title, "Tiramisu");
  assert.equal(draft.servingsBase, 6);
  assert.equal(draft.ingredients.length, 6);
  assert.equal(draft.steps.length, 6);
  assert.equal(draft.source?.url, "https://example.com/tiramisu");
  assert.equal(draft.ingredients[0]?.rawText, "500 g mascarpone");
  assert.equal(draft.steps[0]?.text, "Séparer les blancs des jaunes.");
  assert.ok(!draft.ingredients.some((i) => (i.rawText ?? i.label).includes("Tu veux garder")));
  assert.ok(!draft.steps.some((s) => s.text.includes("Tu veux garder")));
});

test("tryParseRecipeShareF2Text — CTA ignorée, pas source.url", () => {
  const draft = tryParseRecipeShareF2Text(TIRAMISU_F2_TEXT);
  assert.ok(draft);
  assert.equal(draft.source?.url, "https://example.com/tiramisu");
  assert.notEqual(
    draft.source?.url,
    "https://plamarque.github.io/cookies-et-coquilettes/"
  );
  assert.ok(!JSON.stringify(draft).includes(RECIPE_SHARE_F2_CTA));
});

test("tryParseRecipeShareF2Text — sans Portions", () => {
  const text = [
    "Titre:",
    "Soupe",
    "",
    "Ingrédients:",
    "- 1 oignon",
    "",
    "Étapes:",
    "1. Couper.",
    "",
    RECIPE_SHARE_F2_CTA
  ].join("\n");
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.title, "Soupe");
  assert.equal(draft.servingsBase, undefined);
  assert.equal(draft.ingredients.length, 1);
  assert.equal(draft.steps.length, 1);
});

test("tryParseRecipeShareF2Text — sans Source", () => {
  const text = [
    "Titre:",
    "Soupe",
    "",
    "Portions:",
    "2",
    "",
    "Ingrédients:",
    "- 1 oignon",
    "",
    "Étapes:",
    "1. Couper."
  ].join("\n");
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.source?.url, undefined);
  assert.equal(draft.servingsBase, 2);
});

test("tryParseRecipeShareF2Text — non-F2 → null", () => {
  assert.equal(tryParseRecipeShareF2Text("Voici ma super soupe à l'oignon"), null);
  assert.equal(tryParseRecipeShareF2Text("https://example.com/recette"), null);
  assert.equal(tryParseRecipeShareF2Text(""), null);
});

test("tryParseRecipeShareF2Text — titre seul sans ingrédients ni étapes → null", () => {
  const text = ["Titre:", "Vide", "", RECIPE_SHARE_F2_CTA].join("\n");
  assert.equal(tryParseRecipeShareF2Text(text), null);
});

test("tryParseRecipeShareF2Text — sourceType SHARE pour share_target", () => {
  const draft = tryParseRecipeShareF2Text(TIRAMISU_F2_TEXT, { sourceType: "SHARE" });
  assert.ok(draft);
  assert.equal(draft.source?.type, "SHARE");
  assert.equal(draft.source?.url, "https://example.com/tiramisu");
});
