import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@cookies-et-coquilettes/domain";
import { buildNotebookSnapshot, candidateMeetsLiteralConstraints } from "../src/utils/notebook-search";

const recipe = (patch: Partial<Recipe> = {}): Recipe => ({
  id: "durable-id", title: "Soupe de carottes", category: "SALE", favorite: false,
  ingredients: [{ id: "i-1", label: "carotte", isScalable: false }], steps: [],
  createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z", ...patch
});

test("contraintes Cahier : ingrédients requis et interdits sont contrôlés localement", () => {
  assert.equal(candidateMeetsLiteralConstraints("avec carotte", recipe()), true);
  assert.equal(candidateMeetsLiteralConstraints("avec poireau", recipe()), false);
  assert.equal(candidateMeetsLiteralConstraints("sans carotte", recipe()), false);
});

test("contraintes Cahier : une durée demandée exige une durée connue et compatible", () => {
  assert.equal(candidateMeetsLiteralConstraints("en 20 min", recipe()), false);
  assert.equal(candidateMeetsLiteralConstraints("en 20 min", recipe({ prepTimeMin: 10, cookTimeMin: 8 })), true);
  assert.equal(candidateMeetsLiteralConstraints("moins de 18 min", recipe({ prepTimeMin: 10, cookTimeMin: 8 })), false);
  assert.equal(candidateMeetsLiteralConstraints("moins de 19 min", recipe({ prepTimeMin: 10, cookTimeMin: 8 })), true);
});

test("matrice recherche qualifiée : listRecipes, tri, plafond 60 et refs opaques", async () => {
  const recipes = Array.from({ length: 61 }, (_, index) => recipe({
    id: `durable-${String(index).padStart(2, "0")}`,
    title: `Recette ${index}`,
    favorite: index < 2,
    updatedAt: index < 2 ? "2026-10-03T00:00:00.000Z" : `2026-09-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`
  })).reverse();
  let calls = 0;
  const snapshot = await buildNotebookSnapshot(async () => { calls += 1; return recipes; });
  assert.equal(calls, 1);
  assert.equal(snapshot.candidates.length, 60);
  assert.deepEqual(snapshot.candidates.slice(0, 2).map(({ title }) => title), ["Recette 0", "Recette 1"]);
  assert.equal(snapshot.candidates[0].candidateRef, "candidate-1");
  assert.ok(snapshot.candidates.every(({ candidateRef }) => !candidateRef.includes("durable-")));
  assert.equal(snapshot.resolve("candidate-1")?.id, "durable-00");
  assert.equal(snapshot.resolve("candidate-61"), undefined);
  assert.deepEqual(recipes.slice(0, 2).map(({ id }) => id), ["durable-60", "durable-59"]);
});

test("matrice absence utile : contrainte rejetée ne conserve aucun candidat", () => {
  assert.equal(candidateMeetsLiteralConstraints("sans carotte", recipe()), false);
});

test("matrice entrée non sûre : la référence absente ne peut pas être résolue", async () => {
  const snapshot = await buildNotebookSnapshot(async () => [recipe()]);
  assert.equal(snapshot.resolve("candidate-2"), undefined);
});

test("snapshot Cahier : les candidates et la vue de résolution sont immuables et isolées", async () => {
  const source = [recipe({ title: "Soupe initiale" })];
  const snapshot = await buildNotebookSnapshot(async () => source);
  const resolved = snapshot.resolve("candidate-1")!;

  assert.throws(() => { (snapshot.candidates as unknown as Array<unknown>).push({}); }, TypeError);
  assert.throws(() => { (snapshot.candidates[0] as { title: string }).title = "Altérée"; }, TypeError);
  assert.throws(() => { (resolved.ingredients[0] as { label: string }).label = "Altéré"; }, TypeError);
  source[0].title = "Modifiée après snapshot";
  source[0].ingredients[0].label = "modifiée";

  assert.equal(snapshot.candidates[0].title, "Soupe initiale");
  assert.equal(snapshot.candidates[0].ingredientLabels[0], "carotte");
  assert.equal(snapshot.resolve("candidate-1")?.title, "Soupe initiale");
  assert.equal(snapshot.resolve("candidate-1")?.ingredients[0].label, "carotte");
});
