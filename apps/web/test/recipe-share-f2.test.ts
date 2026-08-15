import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@cookies-et-coquilettes/domain";
import {
  RECIPE_SHARE_F2_CTA,
  RECIPE_SHARE_F2_CTA_LEGACY,
  buildRecipeShareF2Text,
  formatIngredientLineForShare,
  formatShareServingsLine,
  tryParseRecipeShareF2Text
} from "../src/utils/recipe-share-f2";

/** Ancien wire — encore accepté au parse. */
const TIRAMISU_F2_TEXT_LEGACY = [
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

/** Nouveau wire — titre nu + `N portions`. */
const TIRAMISU_F2_TEXT = [
  "Tiramisu",
  "6 portions",
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

test("formatIngredientLineForShare prefers displayed quantity over rawText base", () => {
  assert.equal(
    formatIngredientLineForShare({
      id: "x",
      label: "oeufs",
      quantity: 3,
      unit: "pièces",
      isScalable: true,
      rawText: "4 œufs"
    }),
    "3 pièces oeufs"
  );
});

test("formatIngredientLineForShare falls back to rawText when no displayed quantity", () => {
  assert.equal(
    formatIngredientLineForShare({
      id: "x",
      label: "sel",
      isScalable: false,
      rawText: "une pincée de sel"
    }),
    "une pincée de sel"
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

test("formatShareServingsLine omits when absent", () => {
  assert.equal(formatShareServingsLine(undefined), null);
  assert.equal(formatShareServingsLine(null), null);
  assert.equal(formatShareServingsLine(0), null);
  assert.equal(formatShareServingsLine(6), "6 portions");
  assert.equal(formatShareServingsLine(1), "1 portion");
  assert.equal(formatShareServingsLine(6.5), "6,5 portions");
  assert.equal(formatShareServingsLine(0.4), "0,4 portions");
});

test("buildRecipeShareF2Text emits bare title, N portions, CTA last", () => {
  const text = buildRecipeShareF2Text(baseRecipe());
  assert.equal(
    text,
    [
      "Tiramisu",
      "6 portions",
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

test("buildRecipeShareF2Text — CAP-7 base 1 / affichage 4 → 4 portions + qty affichées", () => {
  const recipe = baseRecipe({
    title: "Pâte",
    servingsBase: 1,
    servingsCurrent: 4,
    source: undefined,
    ingredients: [
      {
        id: "i1",
        order: 1,
        label: "farine",
        quantity: 400,
        quantityBase: 100,
        unit: "g",
        isScalable: true,
        rawText: "100 g farine"
      },
      {
        id: "i2",
        order: 2,
        label: "œufs",
        quantity: 2,
        quantityBase: 0.5,
        unit: "",
        isScalable: true,
        rawText: "0,5 œufs"
      }
    ],
    steps: [{ id: "s1", order: 1, text: "Mélanger." }]
  });
  const before = structuredClone(recipe);
  const text = buildRecipeShareF2Text(recipe);
  assert.equal(
    text,
    [
      "Pâte",
      "4 portions",
      "",
      "Ingrédients:",
      "- 400 g farine",
      "- 2 œufs",
      "",
      "Étapes:",
      "1. Mélanger.",
      "",
      RECIPE_SHARE_F2_CTA
    ].join("\n")
  );
  assert.deepEqual(recipe, before);
  assert.equal(recipe.servingsBase, 1);
  assert.equal(recipe.ingredients[0]?.quantityBase, 100);
});

test("buildRecipeShareF2Text — sans servingsCurrent utilise servingsBase", () => {
  const text = buildRecipeShareF2Text(baseRecipe({ servingsBase: 6, servingsCurrent: undefined }));
  assert.ok(text.split("\n").includes("6 portions"));
});

test("buildRecipeShareF2Text omits portions line and Source when absent", () => {
  const text = buildRecipeShareF2Text(
    baseRecipe({
      servingsBase: undefined,
      source: { type: "MANUAL", capturedAt: "2026-01-01T00:00:00.000Z" }
    })
  );
  assert.ok(!text.includes("Portions:"));
  assert.ok(!/\d+\s+portions?/i.test(text.split("\n").slice(0, 3).join("\n")));
  assert.ok(!text.includes("Source:"));
  assert.ok(text.startsWith("Tiramisu\n\nIngrédients:"));
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

test("tryParseRecipeShareF2Text — nouveau wire Tiramisu", () => {
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

test("tryParseRecipeShareF2Text — ancien wire Titre:/Portions:", () => {
  const draft = tryParseRecipeShareF2Text(TIRAMISU_F2_TEXT_LEGACY);
  assert.ok(draft);
  assert.equal(draft.title, "Tiramisu");
  assert.equal(draft.servingsBase, 6);
  assert.equal(draft.ingredients.length, 6);
  assert.equal(draft.steps.length, 6);
  assert.equal(draft.source?.url, "https://example.com/tiramisu");
});

test("tryParseRecipeShareF2Text — CTA ignorée, pas source.url", () => {
  const draft = tryParseRecipeShareF2Text(TIRAMISU_F2_TEXT);
  assert.ok(draft);
  assert.equal(draft.source?.url, "https://example.com/tiramisu");
  assert.notEqual(
    draft.source?.url,
    "https://plamarque.github.io/cookies-et-coquilettes/"
  );
  assert.notEqual(draft.source?.url, "https://plamarque.github.io/cooks-n-coqs/");
  assert.ok(!JSON.stringify(draft).includes(RECIPE_SHARE_F2_CTA));
});

test("tryParseRecipeShareF2Text — CTA historique ignorée, pas source.url Pages", () => {
  const text = [
    "Soupe",
    "2 portions",
    "",
    "Ingrédients:",
    "- 1 oignon",
    "",
    "Étapes:",
    "1. Couper.",
    "",
    RECIPE_SHARE_F2_CTA_LEGACY
  ].join("\n");
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.title, "Soupe");
  assert.equal(draft.servingsBase, 2);
  assert.equal(draft.ingredients.length, 1);
  assert.equal(draft.steps.length, 1);
  assert.equal(draft.source?.url, undefined);
  assert.ok(!JSON.stringify(draft).includes(RECIPE_SHARE_F2_CTA_LEGACY));
  assert.ok(!draft.ingredients.some((i) => (i.rawText ?? i.label).includes("Tu veux garder")));
  assert.ok(!draft.steps.some((s) => s.text.includes("Tu veux garder")));
});

test("buildRecipeShareF2Text — CTA émise sur origine cooks-n-coqs", () => {
  const text = buildRecipeShareF2Text(baseRecipe());
  const lines = text.split("\n");
  assert.equal(
    lines[lines.length - 1],
    "Tu veux garder cette recette ? https://plamarque.github.io/cooks-n-coqs/"
  );
});

test("tryParseRecipeShareF2Text — sans portions (nouveau)", () => {
  const text = [
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

test("tryParseRecipeShareF2Text — ancien wire sans Portions:", () => {
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

test("tryParseRecipeShareF2Text — hybride Titre: + ligne N portions en préambule", () => {
  const text = [
    "4 portions",
    "",
    "Titre:",
    "Soupe",
    "",
    "Ingrédients:",
    "- 1 oignon",
    "",
    "Étapes:",
    "1. Couper."
  ].join("\n");
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.title, "Soupe");
  assert.equal(draft.servingsBase, 4);
});

test("tryParseRecipeShareF2Text — singular 1 portion + round-trip emit", () => {
  const text = buildRecipeShareF2Text(
    baseRecipe({
      servingsBase: 1,
      source: undefined
    })
  );
  assert.ok(text.split("\n").includes("1 portion"));
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.title, "Tiramisu");
  assert.equal(draft.servingsBase, 1);
});

test("tryParseRecipeShareF2Text — portions décimales en préambule", () => {
  const text = [
    "Soupe",
    "6,5 portions",
    "",
    "Ingrédients:",
    "- 1 oignon",
    "",
    "Étapes:",
    "1. Couper."
  ].join("\n");
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.title, "Soupe");
  assert.equal(draft.servingsBase, 6.5);
});

test("buildRecipeShareF2Text — servingsBase 6.5 round-trip sans arrondi", () => {
  const text = buildRecipeShareF2Text(
    baseRecipe({
      servingsBase: 6.5,
      source: undefined
    })
  );
  assert.ok(text.split("\n").includes("6,5 portions"));
  assert.ok(!text.split("\n").includes("7 portions"));
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.servingsBase, 6.5);
});

test("tryParseRecipeShareF2Text — sans Source", () => {
  const text = [
    "Soupe",
    "2 portions",
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
  const text = ["Vide", "", RECIPE_SHARE_F2_CTA].join("\n");
  assert.equal(tryParseRecipeShareF2Text(text), null);
  assert.equal(tryParseRecipeShareF2Text(["Titre:", "Vide", "", RECIPE_SHARE_F2_CTA].join("\n")), null);
});

test("tryParseRecipeShareF2Text — sourceType SHARE pour share_target", () => {
  const draft = tryParseRecipeShareF2Text(TIRAMISU_F2_TEXT, { sourceType: "SHARE" });
  assert.ok(draft);
  assert.equal(draft.source?.type, "SHARE");
  assert.equal(draft.source?.url, "https://example.com/tiramisu");
});
