import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSISTANT_EMPTY_MESSAGE,
  ASSISTANT_STARTERS,
  insertAssistantTranscript,
  isImageAttachment,
  isAssistantSubmitShortcut,
  validateAssistantComposer
} from "../src/utils/assistant-composer";

test("Compositeur : une demande vide explique les formats", () => {
  assert.deepEqual(validateAssistantComposer({ text: "  ", attachment: null }), {
    valid: false,
    message: ASSISTANT_EMPTY_MESSAGE
  });
});

test("Compositeur : texte ou image préparent une demande sans traitement", () => {
  assert.deepEqual(validateAssistantComposer({ text: "une idée repas", attachment: null }), { valid: true });
  assert.deepEqual(
    validateAssistantComposer({ text: "", attachment: { name: "plat.jpg", file: {} as File } }),
    { valid: true }
  );
  assert.equal(ASSISTANT_STARTERS.length, 3);
});

test("Compositeur : Cmd/Ctrl+Entrée est le raccourci d'envoi", () => {
  assert.equal(isAssistantSubmitShortcut({ key: "Enter", metaKey: true, ctrlKey: false }), true);
  assert.equal(isAssistantSubmitShortcut({ key: "Enter", metaKey: false, ctrlKey: true }), true);
  assert.equal(isAssistantSubmitShortcut({ key: "Enter", metaKey: false, ctrlKey: false }), false);
});

test("Compositeur : transcription acceptée insérée au curseur", () => {
  assert.deepEqual(insertAssistantTranscript("Je cuisine ce soir", "une quiche", 10, 10), {
    value: "Je cuisine une quiche ce soir",
    cursor: 21
  });
  assert.deepEqual(insertAssistantTranscript("bonjour monde", "soir", 8, 13), {
    value: "bonjour soir",
    cursor: 12
  });
});

test("Compositeur : seuls les fichiers image sont acceptés", () => {
  assert.equal(isImageAttachment({ type: "image/png" }), true);
  assert.equal(isImageAttachment({ type: "text/plain" }), false);
});
