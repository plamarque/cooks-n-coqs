import assert from "node:assert/strict";
import test from "node:test";
import { startBrowserSpeechRecognition } from "../src/services/speech-recognition-adapter";

test("dictée : API absente, le texte reste l'alternative", () => {
  let unavailable = "";
  const session = startBrowserSpeechRecognition(undefined, {
    onTranscript: () => assert.fail("aucune transcription"),
    onUnavailable: (message) => (unavailable = message),
    onError: () => assert.fail("aucune erreur"),
    onEnd: () => undefined
  });
  assert.equal(session, null);
  assert.match(unavailable, /écrire/i);
});

test("dictée : configuration et toutes les transcriptions finales après resultIndex", () => {
  let instance: FakeRecognition | undefined;
  class FakeRecognition {
    lang = "";
    interimResults = true;
    continuous = true;
    onresult: ((event: any) => void) | null = null;
    onerror: (() => void) | null = null;
    onend: (() => void) | null = null;
    start() { instance = this; }
    stop() { this.onend?.(); }
  }
  const transcripts: string[] = [];
  const session = startBrowserSpeechRecognition({ SpeechRecognition: FakeRecognition }, {
    onTranscript: (text) => transcripts.push(text),
    onUnavailable: () => assert.fail("API disponible"),
    onError: () => assert.fail("pas d'erreur"),
    onEnd: () => undefined
  });
  instance?.onresult?.({
    resultIndex: 1,
    results: [
      { isFinal: true, 0: { transcript: "ignoré avant index" } },
      { isFinal: false, 0: { transcript: "brouillon" } },
      { isFinal: true, 0: { transcript: " une tarte " } },
      { isFinal: true, 0: { transcript: " et une salade " } }
    ]
  });
  session?.stop();
  assert.deepEqual(transcripts, ["une tarte", "et une salade"]);
  assert.equal(instance?.lang, "fr-FR");
  assert.equal(instance?.interimResults, false);
  assert.equal(instance?.continuous, false);
});

test("dictée : erreur navigateur et échec de démarrage conservent le fallback texte", () => {
  let instance: ErrorRecognition | undefined;
  class ErrorRecognition {
    lang = "";
    interimResults = false;
    continuous = false;
    onresult: ((event: any) => void) | null = null;
    onerror: (() => void) | null = null;
    onend: (() => void) | null = null;
    start() { instance = this; }
    stop() { this.onend?.(); }
  }
  const errors: string[] = [];
  startBrowserSpeechRecognition({ webkitSpeechRecognition: ErrorRecognition }, {
    onTranscript: () => assert.fail("pas de transcript"),
    onUnavailable: () => assert.fail("API disponible"),
    onError: (message) => errors.push(message),
    onEnd: () => undefined
  });
  instance?.onerror?.();
  assert.match(errors[0], /texte est conservé/i);

  class ThrowingRecognition extends ErrorRecognition {
    start() { throw new Error("permission refusée"); }
  }
  const failed = startBrowserSpeechRecognition({ SpeechRecognition: ThrowingRecognition }, {
    onTranscript: () => assert.fail("pas de transcript"),
    onUnavailable: () => assert.fail("API disponible"),
    onError: (message) => errors.push(message),
    onEnd: () => undefined
  });
  assert.equal(failed, null);
  assert.equal(errors.length, 2);
});
