import assert from "node:assert/strict";
import test from "node:test";
import { stepIngredientOverflowCount } from "../src/utils/step-ingredient-display";

test("stepIngredientOverflowCount is 0 when total is at or below max", () => {
  assert.equal(stepIngredientOverflowCount(0, 3), 0);
  assert.equal(stepIngredientOverflowCount(1, 3), 0);
  assert.equal(stepIngredientOverflowCount(3, 3), 0);
});

test("stepIngredientOverflowCount returns surplus beyond max", () => {
  assert.equal(stepIngredientOverflowCount(4, 3), 1);
  assert.equal(stepIngredientOverflowCount(5, 3), 2);
  assert.equal(stepIngredientOverflowCount(6, 3), 3);
});

test("stepIngredientOverflowCount respects custom max", () => {
  assert.equal(stepIngredientOverflowCount(5, 5), 0);
  assert.equal(stepIngredientOverflowCount(7, 5), 2);
});
