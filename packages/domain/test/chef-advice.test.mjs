import test from "node:test";
import assert from "node:assert/strict";
import { isChefAdviceRequestV1, isChefAdviceWireV1 } from "../src/chef-advice.js";

test("conseil Chef : le wire est fermé et borné", () => {
  assert.equal(isChefAdviceRequestV1({ request: "Comment rattraper ma sauce ?", context: { servings: 4 } }), true);
  assert.equal(isChefAdviceRequestV1({ request: "x", history: [] }), false);
  assert.equal(isChefAdviceRequestV1({ request: "x", context: [] }), false);
  assert.equal(isChefAdviceWireV1({ kind: "advice", recommendation: "Ajoute un peu d’eau.", reason: "Elle épaissira moins.", confidence: ["certain"] }), true);
  assert.equal(isChefAdviceWireV1({ kind: "advice", recommendation: "x", reason: "y", confidence: ["secret"] }), false);
  assert.equal(isChefAdviceWireV1({ kind: "advice", recommendation: "x", reason: "y", confidence: [] }), false);
  assert.equal(isChefAdviceWireV1({ kind: "advice", recommendation: "x", reason: "y", confidence: ["certain", "certain"] }), false);
  assert.equal(isChefAdviceWireV1({ kind: "recipe", extra: true }), false);
});
