import assert from "node:assert/strict";
import test from "node:test";
import type { IngredientLine, InstructionStep } from "@cookies-et-coquilettes/domain";
import {
  filterStepIngredientIdsToKnown,
  getMentionedIngredientsForStepByTokens,
  ingredientIdsForStepSave,
  ingredientsEnsembleChanged,
  remapStepIngredientIds,
  resolveMentionedIngredientsForStep,
  withBoundIngredientIdsForForm
} from "../src/utils/step-ingredient-mentions";

const ingredients: IngredientLine[] = [
  { id: "ing-farine", order: 1, label: "farine", isScalable: true },
  { id: "ing-beurre", order: 2, label: "beurre", isScalable: true }
];

test("resolveMentionedIngredientsForStep: préfère ingredientIds persistés", () => {
  const step = {
    text: "Ajoutez-les ensuite.",
    ingredientIds: ["ing-beurre", "ing-farine", "orphelins"]
  };
  const resolved = resolveMentionedIngredientsForStep(step, ingredients);
  assert.deepEqual(
    resolved.map((i) => i.id),
    ["ing-beurre", "ing-farine"]
  );
});

test("resolveMentionedIngredientsForStep: fallback tokens si ids absents", () => {
  const step = { text: "Ajouter la farine." };
  const resolved = resolveMentionedIngredientsForStep(step, ingredients);
  assert.deepEqual(
    resolved.map((i) => i.id),
    ["ing-farine"]
  );
});

test("resolveMentionedIngredientsForStep: ids vides / inconnus → tokens", () => {
  const byEmpty = resolveMentionedIngredientsForStep(
    { text: "Ajouter la farine.", ingredientIds: [] },
    ingredients
  );
  assert.deepEqual(
    byEmpty.map((i) => i.id),
    ["ing-farine"]
  );
  const byOrphans = resolveMentionedIngredientsForStep(
    { text: "Ajouter la farine.", ingredientIds: ["ghost"] },
    ingredients
  );
  assert.deepEqual(
    byOrphans.map((i) => i.id),
    ["ing-farine"]
  );
});

test("getMentionedIngredientsForStepByTokens: ellipse → []", () => {
  const resolved = getMentionedIngredientsForStepByTokens(
    { text: "Ajoutez-les ensuite." },
    ingredients
  );
  assert.deepEqual(resolved, []);
});

test("remapStepIngredientIds: remappe vers nouveaux ids", () => {
  const steps: InstructionStep[] = [
    {
      id: "step-1",
      order: 1,
      text: "Mélanger.",
      ingredientIds: ["old-a", "old-b"]
    }
  ];
  const map = new Map([
    ["old-a", "new-a"],
    ["old-b", "new-b"]
  ]);
  const out = remapStepIngredientIds(steps, map);
  assert.deepEqual(out[0]?.ingredientIds, ["new-a", "new-b"]);
});

test("filterStepIngredientIdsToKnown: retire les orphelins", () => {
  const steps: InstructionStep[] = [
    {
      id: "s1",
      order: 1,
      text: "Mélanger.",
      ingredientIds: ["ing-farine", "ghost"]
    },
    {
      id: "s2",
      order: 2,
      text: "Cuire.",
      ingredientIds: ["ghost"]
    }
  ];
  const out = filterStepIngredientIdsToKnown(steps, new Set(["ing-farine"]));
  assert.deepEqual(out[0]?.ingredientIds, ["ing-farine"]);
  assert.equal(out[1]?.ingredientIds, undefined);
});

test("ingredientIdsForStepSave: conserve si boundText et baseline ok (CREATE)", () => {
  const currentIds = new Set(["ing-farine", "ing-beurre"]);
  assert.deepEqual(
    ingredientIdsForStepSave(
      {
        id: "step-1",
        text: "Ajouter la farine.",
        ingredientIds: ["ing-farine"],
        ingredientIdsBoundText: "Ajouter la farine."
      },
      currentIds,
      { importedIngredientIdsBaseline: ["ing-farine", "ing-beurre"] }
    ),
    ["ing-farine"]
  );
});

test("ingredientIdsForStepSave: clear si texte ≠ boundText (CREATE sans existing)", () => {
  const currentIds = new Set(["ing-farine", "ing-beurre"]);
  assert.equal(
    ingredientIdsForStepSave(
      {
        id: "step-1",
        text: "Autre texte édité.",
        ingredientIds: ["ing-farine"],
        ingredientIdsBoundText: "Ajouter la farine."
      },
      currentIds,
      { importedIngredientIdsBaseline: ["ing-farine", "ing-beurre"] }
    ),
    undefined
  );
});

test("ingredientIdsForStepSave: clear si ensemble ingrédients ≠ baseline (CREATE)", () => {
  const currentIds = new Set(["ing-farine"]);
  assert.equal(
    ingredientIdsForStepSave(
      {
        id: "step-1",
        text: "Ajouter la farine.",
        ingredientIds: ["ing-farine"],
        ingredientIdsBoundText: "Ajouter la farine."
      },
      currentIds,
      { importedIngredientIdsBaseline: ["ing-farine", "ing-beurre"] }
    ),
    undefined
  );
});

test("ingredientIdsForStepSave: clear si texte changé vs existing (EDIT)", () => {
  const existing = {
    steps: [
      {
        id: "step-1",
        order: 1,
        text: "Ajouter la farine.",
        ingredientIds: ["ing-farine"]
      }
    ] as InstructionStep[],
    ingredients
  };
  const currentIds = new Set(["ing-farine", "ing-beurre"]);
  assert.equal(
    ingredientIdsForStepSave(
      { id: "step-1", text: "Autre texte.", ingredientIds: ["ing-farine"] },
      currentIds,
      { existing }
    ),
    undefined
  );
  assert.equal(ingredientsEnsembleChanged(ingredients, new Set(["ing-farine"])), true);
  assert.equal(
    ingredientsEnsembleChanged(ingredients, new Set(["ing-farine", "ing-beurre"])),
    false
  );
});

test("ingredientIdsForStepSave: clear si ensemble ingrédients ≠ existing (EDIT)", () => {
  const existing = {
    steps: [
      {
        id: "step-1",
        order: 1,
        text: "Ajouter la farine.",
        ingredientIds: ["ing-farine"]
      }
    ] as InstructionStep[],
    ingredients
  };
  assert.equal(
    ingredientIdsForStepSave(
      {
        id: "step-1",
        text: "Ajouter la farine.",
        ingredientIds: ["ing-farine"],
        ingredientIdsBoundText: "Ajouter la farine."
      },
      new Set(["ing-farine"]),
      { existing }
    ),
    undefined
  );
});

test("getMentionedIngredientsForStepByTokens: text null/undefined → []", () => {
  assert.deepEqual(
    getMentionedIngredientsForStepByTokens({ text: null }, ingredients),
    []
  );
  assert.deepEqual(
    getMentionedIngredientsForStepByTokens({ text: undefined }, ingredients),
    []
  );
});

test("withBoundIngredientIdsForForm: filtre orphelins + boundText (draft→form)", () => {
  const valid = new Set(["ing-farine", "ing-beurre"]);
  const bound = withBoundIngredientIdsForForm(
    {
      id: "s1",
      text: "Ajouter la farine.",
      ingredientIds: ["ing-farine", " ghost ", "ing-beurre"]
    },
    valid
  );
  assert.deepEqual(bound.ingredientIds, ["ing-farine", "ing-beurre"]);
  assert.equal(bound.ingredientIdsBoundText, "Ajouter la farine.");
  assert.deepEqual(
    ingredientIdsForStepSave(
      {
        id: bound.id,
        text: bound.text,
        ingredientIds: bound.ingredientIds,
        ingredientIdsBoundText: bound.ingredientIdsBoundText
      },
      valid,
      { importedIngredientIdsBaseline: ["ing-farine", "ing-beurre"] }
    ),
    ["ing-farine", "ing-beurre"]
  );
});

test("ingredientIdsForStepSave: trim des ids avant filtre", () => {
  assert.deepEqual(
    ingredientIdsForStepSave(
      {
        id: "step-1",
        text: "Ajouter la farine.",
        ingredientIds: ["  ing-farine  "],
        ingredientIdsBoundText: "Ajouter la farine."
      },
      new Set(["ing-farine"]),
      { importedIngredientIdsBaseline: ["ing-farine"] }
    ),
    ["ing-farine"]
  );
});
