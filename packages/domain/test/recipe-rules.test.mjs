import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeAssistantDraftWireV1,
  assertRecipeValidForSave,
  isRecipeValidForSave,
  normalizeIngredient,
  scaleIngredientsFromBase
} from "../src/recipe-rules.js";

test("le wire Assistant fermé refuse les données de persistance", () => {
  const valid = { title: "Soupe", category: "SALE", ingredients: [{ id: "ingredient-1", label: "eau", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Chauffer" }] };
  assert.equal(decodeAssistantDraftWireV1(valid)?.title, "Soupe");
  assert.equal(decodeAssistantDraftWireV1({ ...valid, source: { type: "TEXT" } }), null);
  assert.equal(decodeAssistantDraftWireV1({ ...valid, ingredients: [{ ...valid.ingredients[0], extra: true }] }), null);
  assert.equal(decodeAssistantDraftWireV1({ ...valid, steps: [{ ...valid.steps[0], order: 2 }] }), null);
});

test("le wire Assistant conserve quantité et unité séparées du libellé", () => {
  const draft = decodeAssistantDraftWireV1({
    title: "Banana bread", category: "SUCRE",
    ingredients: [
      { id: "ingredient-1", label: "bananes très mûres", quantity: 2, unit: "bananes", isScalable: true },
      { id: "ingredient-2", label: "farine", quantity: 100, unit: "g", isScalable: true },
      { id: "ingredient-3", label: "sel", quantity: 1, unit: "pincée", isScalable: false }
    ],
    steps: [{ id: "step-1", order: 1, text: "Mélanger." }]
  });
  assert.deepEqual(draft?.ingredients, [
    { id: "ingredient-1", label: "bananes très mûres", quantity: 2, unit: "bananes", isScalable: true },
    { id: "ingredient-2", label: "farine", quantity: 100, unit: "g", isScalable: true },
    { id: "ingredient-3", label: "sel", quantity: 1, unit: "pincée", isScalable: false }
  ]);
});

test("validation: reject empty title and empty content", () => {
  assert.equal(
    isRecipeValidForSave({
      title: " ",
      ingredients: [],
      steps: []
    }),
    false
  );

  assert.throws(
    () =>
      assertRecipeValidForSave({
        title: "Recette vide",
        ingredients: [],
        steps: []
      }),
    /at least one ingredient or one step/
  );
});

test("validation: accept ingredient-only or step-only recipe", () => {
  assert.equal(
    isRecipeValidForSave({
      title: "Pancakes",
      ingredients: [{ id: "i1", label: "Farine", isScalable: false }],
      steps: []
    }),
    true
  );

  assert.equal(
    isRecipeValidForSave({
      title: "Riz",
      ingredients: [],
      steps: [{ id: "s1", order: 1, text: "Cuire" }]
    }),
    true
  );
});

test("normalizeIngredient: set quantityBase for scalable ingredient", () => {
  const normalized = normalizeIngredient({
    id: "i1",
    label: "Farine",
    quantity: 250,
    unit: "g",
    isScalable: true
  });

  assert.equal(normalized.quantityBase, 250);
});

test("scaleIngredientsFromBase: scale from immutable base without drift", () => {
  const ingredients = [
    { id: "i1", label: "Farine", quantity: 250, quantityBase: 250, unit: "g", isScalable: true },
    { id: "i2", label: "Oeuf", quantity: 2, quantityBase: 2, unit: "oeuf", isScalable: true },
    { id: "i3", label: "Pincée de sel", isScalable: false }
  ];

  const forFour = scaleIngredientsFromBase(ingredients, 4, 2);
  assert.equal(forFour[0].quantity, 500);
  assert.equal(forFour[1].quantity, 4);
  assert.equal(forFour[2].quantity, undefined);

  const forThree = scaleIngredientsFromBase(ingredients, 3, 2);
  assert.equal(forThree[0].quantity, 375);
  assert.equal(forThree[1].quantity, 3);
});
