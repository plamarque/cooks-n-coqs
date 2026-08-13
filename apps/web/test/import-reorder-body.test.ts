import assert from "node:assert/strict";
import test from "node:test";
import { reorderStepsRequestBody } from "../src/utils/reorder-steps-request";

test("reorderStepsRequestBody: forward ingredientIds (import multi-captures)", () => {
  const body = reorderStepsRequestBody([
    {
      id: "s1",
      order: 1,
      text: "Ajouter la farine.",
      ingredientIds: ["ing-farine"]
    },
    {
      id: "s2",
      order: 2,
      text: "Mélanger."
    }
  ]);
  assert.deepEqual(body.steps[0]?.ingredientIds, ["ing-farine"]);
  assert.equal(body.steps[1]?.ingredientIds, undefined);
  assert.equal(body.steps[1]?.text, "Mélanger.");
});
