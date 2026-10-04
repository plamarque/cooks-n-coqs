import test from "node:test";
import assert from "node:assert/strict";
import {
  NOTEBOOK_SELECTION_REQUEST_MAX_LENGTH,
  isNotebookSelectionRequestV1
} from "../src/notebook-selection.js";

const candidate = { candidateRef: "candidate-1", title: "Soupe", ingredientLabels: ["carotte"], durationMin: 25 };

test("sélection Cahier : le contrat partagé accepte le plafond validé de 2 600 caractères", () => {
  assert.equal(NOTEBOOK_SELECTION_REQUEST_MAX_LENGTH, 2_600);
  assert.equal(isNotebookSelectionRequestV1({ request: "x".repeat(2_600), candidates: [candidate] }), true);
  assert.equal(isNotebookSelectionRequestV1({ request: "x".repeat(2_601), candidates: [candidate] }), false);
});

test("sélection Cahier : le contrat partagé refuse les enrichissements et les refs hors contrat", () => {
  assert.equal(isNotebookSelectionRequestV1({ request: "dîner", candidates: [{ ...candidate, durableId: "secret" }] }), false);
  assert.equal(isNotebookSelectionRequestV1({ request: "dîner", candidates: [{ ...candidate, candidateRef: "durable-id" }] }), false);
  assert.equal(isNotebookSelectionRequestV1({ request: "dîner", candidates: [{ ...candidate }, { ...candidate }] }), false);
});
