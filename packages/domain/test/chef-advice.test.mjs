import test from "node:test";
import assert from "node:assert/strict";
import { isChefAdviceRequestV1, isChefAdviceWireV1 } from "../src/chef-advice.js";
import { isChefTurnClassificationRequestV1, isChefTurnClassificationV1, isChefTurnClassificationWireV1 } from "../src/chef-turn-classification.js";

test("classification Chef : contrat fermé, une seule donnée manquante et référence locale optionnelle", () => {
  assert.equal(isChefTurnClassificationRequestV1({ message: "au Cookeo et sans crème", context: { objective: "des cèpes", constraints: ["sans crème"], clarification: "Quel appareil ?", reference: { title: "Échine aux cèpes" } } }), true);
  assert.equal(isChefTurnClassificationRequestV1({ message: "x", context: { recipeId: "local" } }), false);
  const wire = { intent: "adapt", confidence: "high", constraints: ["au Cookeo", "sans crème"], missing: { field: "coupe", question: "Quelle coupe de porc utilisez-vous ?" } };
  assert.equal(isChefTurnClassificationWireV1(wire), true);
  assert.equal(isChefTurnClassificationV1({ ...wire, reference: { title: "Échine aux cèpes", source: "clarification" } }), true);
  assert.equal(isChefTurnClassificationWireV1({ ...wire, extra: true }), false);
  assert.equal(isChefTurnClassificationWireV1({ ...wire, constraints: ["sans crème", "sans crème"] }), false);
  assert.equal(isChefTurnClassificationWireV1({ ...wire, constraints: ["Sans crème", " sans crème "] }), false);
  assert.equal(isChefTurnClassificationWireV1({ ...wire, missing: { field: "x", question: "q", another: true } }), false);
});

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
