import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedRecipeDraft } from "@cookies-et-coquilettes/domain";
import { mergeDrafts } from "../src/utils/merge-recipe-drafts";

function draft(partial: Partial<ParsedRecipeDraft>): ParsedRecipeDraft {
  return {
    title: "Recette",
    category: "SALE",
    ingredients: [],
    steps: [],
    source: { type: "SCREENSHOT", capturedAt: "2026-01-01T00:00:00.000Z" },
    ...partial
  };
}

test("mergeDrafts: remappe ingredientIds via dédup labels (multi-captures)", () => {
  const a = draft({
    title: "Capture A",
    ingredients: [
      { id: "old-farine-a", label: "farine", isScalable: true },
      { id: "old-sel", label: "sel", isScalable: false }
    ],
    steps: [
      {
        id: "s1",
        order: 1,
        text: "Ajouter la farine.",
        ingredientIds: ["old-farine-a"]
      }
    ]
  });
  const b = draft({
    title: "Capture B",
    ingredients: [
      { id: "old-farine-b", label: "Farine", isScalable: true },
      { id: "old-beurre", label: "beurre", isScalable: true }
    ],
    steps: [
      {
        id: "s2",
        order: 2,
        text: "Incorporer le beurre.",
        ingredientIds: ["old-beurre", "old-farine-b"]
      }
    ]
  });

  const merged = mergeDrafts([a, b]);
  assert.equal(merged.ingredients.length, 3);
  const farine = merged.ingredients.find((i) => i.label.toLowerCase() === "farine");
  const beurre = merged.ingredients.find((i) => i.label.toLowerCase() === "beurre");
  const sel = merged.ingredients.find((i) => i.label.toLowerCase() === "sel");
  assert.ok(farine && beurre && sel);

  const stepFarine = merged.steps.find((s) => /farine/i.test(s.text));
  const stepBeurre = merged.steps.find((s) => /beurre/i.test(s.text));
  assert.deepEqual(stepFarine?.ingredientIds, [farine!.id]);
  assert.deepEqual(stepBeurre?.ingredientIds, [beurre!.id, farine!.id]);
  assert.ok(!stepFarine?.ingredientIds?.includes("old-farine-a"));
  assert.ok(!stepBeurre?.ingredientIds?.includes("old-beurre"));
});

test("mergeDrafts: un seul draft → identité si ids valides", () => {
  const one = draft({
    ingredients: [{ id: "ing-1", label: "farine", isScalable: true }],
    steps: [
      { id: "s1", order: 1, text: "Ajouter la farine.", ingredientIds: ["ing-1"] }
    ]
  });
  const out = mergeDrafts([one]);
  assert.equal(out, one);
  assert.deepEqual(out.steps[0]?.ingredientIds, ["ing-1"]);
});

test("mergeDrafts: un seul draft → filtre ingredientIds orphelins", () => {
  const one = draft({
    ingredients: [{ id: "ing-1", label: "farine", isScalable: true }],
    steps: [
      {
        id: "s1",
        order: 1,
        text: "Ajouter la farine.",
        ingredientIds: ["ing-1", "ghost"]
      }
    ]
  });
  const out = mergeDrafts([one]);
  assert.notEqual(out, one);
  assert.deepEqual(out.steps[0]?.ingredientIds, ["ing-1"]);
});

test("mergeDrafts: filtre ingredientIds orphelins après remap", () => {
  const a = draft({
    ingredients: [{ id: "keep-a", label: "farine", isScalable: true }],
    steps: [
      {
        id: "s1",
        order: 1,
        text: "Ajouter.",
        ingredientIds: ["keep-a", "ghost-missing"]
      }
    ]
  });
  const b = draft({
    ingredients: [{ id: "keep-b", label: "beurre", isScalable: true }],
    steps: [{ id: "s2", order: 2, text: "Incorporer.", ingredientIds: ["keep-b"] }]
  });
  const merged = mergeDrafts([a, b]);
  const farine = merged.ingredients.find((i) => i.label.toLowerCase() === "farine");
  const stepA = merged.steps.find((s) => s.text === "Ajouter.");
  assert.ok(farine);
  assert.deepEqual(stepA?.ingredientIds, [farine!.id]);
  assert.ok(!stepA?.ingredientIds?.includes("ghost-missing"));
});
