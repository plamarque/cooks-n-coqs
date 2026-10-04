import assert from "node:assert/strict";
import test from "node:test";
import { createNoCandidateAssistantPreview } from "../src/utils/assistant-no-candidate";

const generated = { title: "Velouté", category: "SALE" as const, ingredients: [{ id: "ingredient-1", label: "courge", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Mixer." }] };

test("noCandidate : création, demande enrichie, provenance image et originaux sont transmis", async () => {
  const original = new File(["original"], "photo-originale.jpg", { type: "image/jpeg" });
  const transferCopy = new File(["copy"], "photo-transfer.jpg", { type: "image/jpeg" });
  const phases: string[] = [];
  let received: unknown[] = [];
  const preview = await createNoCandidateAssistantPreview({
    route: "image",
    selectionRequest: "Dîner\nRésumés visuels temporaires: courge",
    sourceFiles: [original],
    turns: [{ role: "user", text: "Dîner" }],
    signal: new AbortController().signal,
    creating: () => phases.push("creating"),
    generate: async (...args) => { received = args; return generated; },
    capturedAt: () => "2026-10-04T12:00:00.000Z"
  });
  assert.deepEqual(phases, ["creating"]);
  assert.equal(received[0], "Dîner\nRésumés visuels temporaires: courge");
  assert.equal(preview.draft.source?.type, "SCREENSHOT");
  assert.equal(preview.draft.source?.capturedAt, "2026-10-04T12:00:00.000Z");
  assert.equal(preview.sourceFiles[0], original);
  assert.notEqual(preview.sourceFiles[0], transferCopy);
});

test("noCandidate texte : la provenance est TEXT", async () => {
  const preview = await createNoCandidateAssistantPreview({
    route: "text", selectionRequest: "Soupe", sourceFiles: [], turns: [], signal: new AbortController().signal,
    creating: () => {}, generate: async () => generated, capturedAt: () => "2026-10-04T12:00:00.000Z"
  });
  assert.equal(preview.draft.source?.type, "TEXT");
});
