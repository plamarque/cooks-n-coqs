import assert from "node:assert/strict";
import test from "node:test";
import { AssistantSession, routeAssistantImport } from "../src/utils/assistant-session";

const draft = { title: "Soupe", category: "SALE" as const, ingredients: [], steps: [], source: { type: "TEXT" as const, capturedAt: "2026-10-02" } };

test("session Assistant : image puis URL puis texte", () => {
  assert.equal(routeAssistantImport("https://example.test", {} as File), "image");
  assert.equal(routeAssistantImport("https://example.test", null), "url");
  assert.equal(routeAssistantImport("Soupe", null), "text");
});

test("session Assistant : dispatch réel image, URL puis texte", async () => {
  const calls: Array<[string, string]> = [];
  const adapter = {
    importImage: async (_file: File, context: string) => { calls.push(["image", context]); return draft; },
    importUrl: async (url: string) => { calls.push(["url", url]); return draft; },
    importText: async (text: string) => { calls.push(["text", text]); return draft; }
  };
  await new AssistantSession().import("https://example.test/avec-contexte", {} as File, adapter);
  await new AssistantSession().import("  https://example.test/recette  ", null, adapter);
  await new AssistantSession().import("Recette collée", null, adapter);
  assert.deepEqual(calls, [
    ["image", "https://example.test/avec-contexte"],
    ["url", "https://example.test/recette"],
    ["text", "Recette collée"]
  ]);
});

test("session Assistant : cancel abort réellement le signal de l'adaptateur", async () => {
  let receivedSignal: AbortSignal | undefined;
  const session = new AssistantSession();
  const pending = session.import("Recette", null, {
    importImage: async () => draft,
    importUrl: async () => draft,
    importText: async (_text, signal) => {
      receivedSignal = signal;
      return new Promise<never>(() => {});
    }
  });
  await Promise.resolve();
  session.cancel();
  assert.equal(receivedSignal?.aborted, true);
  // L'attente ne sera jamais résolue : la promesse est laissée sans effet après abort.
  void pending;
});

test("session Assistant : annulation ignore le résultat tardif", async () => {
  let resolve!: (value: typeof draft) => void;
  const pending = new Promise<typeof draft>((done) => { resolve = done; });
  const session = new AssistantSession();
  const importing = session.import("Soupe", null, { importImage: async () => draft, importUrl: async () => draft, importText: async () => pending });
  session.cancel(); resolve(draft);
  assert.equal(await importing, null);
  assert.equal(session.preview, null);
});

test("session Assistant : fermeture détruit la preview", async () => {
  const session = new AssistantSession();
  await session.import("Soupe", null, { importImage: async () => draft, importUrl: async () => draft, importText: async () => draft });
  session.closePreview();
  assert.equal(session.preview, null);
});

test("session Assistant : fallback draft devient une prévisualisation ouvrable", async () => {
  const fallback = { ...draft, title: "Recette depuis texte", source: { type: "TEXT" as const, capturedAt: "2026-10-02" } };
  const session = new AssistantSession();
  const preview = await session.import("Texte source", null, {
    importImage: async () => fallback,
    importUrl: async () => fallback,
    importText: async () => fallback
  });
  assert.equal(session.phase, "ready");
  assert.equal(preview?.draft.title, "Recette depuis texte");
  assert.equal(preview?.source?.type, "TEXT");
});

test("session Assistant : erreur sans draft laisse la commande appelante intacte", async () => {
  const command = "Une recette encore modifiable";
  const session = new AssistantSession();
  const preview = await session.import(command, null, {
    importImage: async () => { throw new Error("échec"); },
    importUrl: async () => { throw new Error("échec"); },
    importText: async () => { throw new Error("échec"); }
  });
  assert.equal(preview, null);
  assert.equal(session.phase, "error");
  assert.match(session.error ?? "", /Impossible d’importer/);
  assert.equal(command, "Une recette encore modifiable");
  assert.equal(session.preview, null);
});

test("session Assistant : un nouvel import efface la preview précédente avant son issue", async () => {
  const session = new AssistantSession();
  await session.import("première", null, { importImage: async () => draft, importUrl: async () => draft, importText: async () => draft });
  let resolve!: (value: typeof draft) => void;
  const pending = new Promise<typeof draft>((done) => { resolve = done; });
  const retry = session.import("seconde", null, { importImage: async () => draft, importUrl: async () => draft, importText: async () => pending });
  assert.equal(session.preview, null);
  session.cancel();
  resolve(draft);
  assert.equal(await retry, null);
  assert.equal(session.preview, null);
});
