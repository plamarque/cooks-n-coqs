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

test("conseil Chef : le contexte complet garde les rôles et refuse les champs locaux", () => {
  const context = { turns: [{ role: "user", text: "porc et cèpes", cards: [{ title: "Échine", ingredients: ["porc", "cèpes"], steps: ["Mijoter"] }] }, { role: "assistant", text: "Prends une échine." }, { role: "user", text: "au Cookeo" }] };
  assert.equal(isChefAdviceRequestV1({ request: "au Cookeo", context }), true);
  assert.equal(isChefAdviceRequestV1({ request: "x", context: { turns: [{ role: "user", text: "x", id: "local" }] } }), false);
  assert.equal(isChefAdviceRequestV1({ request: "x", context: { turns: [{ role: "user", text: "x", cards: [{ title: "x", ingredients: [], steps: [], thumbnail: "blob:local" }] }] } }), false);
  assert.equal(isChefAdviceRequestV1({ request: "x", context: { turns: [{ role: "user", text: "x", cards: [{ title: "x", ingredients: [], steps: [], thumbnail: "data:image/svg+xml;base64,PHN2Zy8+" }] }] } }), false);
  assert.equal(isChefAdviceRequestV1({ request: "x", context: { turns: [{ role: "user", text: "x", cards: Array.from({ length: 3 }, () => ({ title: "x", ingredients: [], steps: [], thumbnail: `data:image/png;base64,${"a".repeat(139_000)}` })) }] } }), false);
  const longButBounded = Array.from({ length: 81 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `tour ${index}` }));
  assert.equal(isChefAdviceRequestV1({ request: "x", context: { turns: longButBounded } }), true);
});
