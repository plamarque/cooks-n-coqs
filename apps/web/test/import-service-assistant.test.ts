import assert from "node:assert/strict";
import test from "node:test";
import { assistantImportAdapter, bffImportService } from "../src/services/import-service";

test("adaptateur Assistant image : transmet contextText sans persister le fichier", async () => {
  const originalFetch = globalThis.fetch;
  let body: FormData | undefined;
  globalThis.fetch = async (_input, init) => {
    body = init?.body as FormData;
    return new Response(JSON.stringify({ title: "OCR", category: "SALE", ingredients: [], steps: [] }), { status: 200 });
  };
  try {
    const file = new File(["image"], "plat.png", { type: "image/png" });
    const draft = await assistantImportAdapter.importImage(file, "notes visibles", new AbortController().signal);
    assert.equal(draft.title, "OCR");
    assert.equal(body?.get("contextText"), "notes visibles");
    assert.ok(body?.get("file") instanceof Blob);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adaptateur Assistant : AbortError fetch est propagée, jamais convertie en fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new DOMException("Annulé", "AbortError"); };
  try {
    await assert.rejects(
      () => assistantImportAdapter.importText("texte", new AbortController().signal),
      { name: "AbortError" }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adaptateur Assistant URL : refus de lecture renvoie un draft URL éditable en conservant la query string", async () => {
  const originalFetch = globalThis.fetch;
  const url = "https://chatgpt.com/share/abc123?utm_source=share";
  globalThis.fetch = async () => new Response("Accès refusé", { status: 403 });
  try {
    const draft = await assistantImportAdapter.importUrl(url, new AbortController().signal);
    assert.equal(draft.title, "Recette depuis URL");
    assert.equal(draft.source?.type, "URL");
    assert.equal(draft.source?.url, url);
    assert.deepEqual(draft.ingredients, []);
    assert.deepEqual(draft.steps, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("import photos v1 : expose préparation, lecture n/N puis vérification", async () => {
  const originalFetch = globalThis.fetch;
  const phases: string[] = [];
  let screenshotCount = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/api/import/reorder-steps")) {
      return new Response(JSON.stringify({ steps: [{ id: "s1", order: 1, text: "Mélanger." }, { id: "s2", order: 2, text: "Cuire." }] }), { status: 200 });
    }
    screenshotCount += 1;
    return new Response(JSON.stringify({ title: "OCR", category: "SALE", ingredients: [], steps: [{ id: `s${screenshotCount}`, order: 1, text: screenshotCount === 1 ? "Mélanger." : "Cuire." }] }), { status: 200 });
  };
  try {
    await bffImportService.importFromScreenshots([
      new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })
    ], { assistantPrepared: true, onProgress: (event) => phases.push(`${event.phase}:${event.current}/${event.total}`) });
    assert.deepEqual(phases, ["preparing:1/2", "reading:1/2", "preparing:2/2", "reading:2/2", "reordering:2/2"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("import photos v1 : propage l'annulation sans créer de brouillon fallback", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = async (_input, init) => {
    assert.equal((init?.signal as AbortSignal).aborted, true);
    throw new DOMException("Annulé", "AbortError");
  };
  try {
    await assert.rejects(
      () => bffImportService.importFromScreenshots([new File(["a"], "a.png", { type: "image/png" })], { assistantPrepared: true, signal: controller.signal }),
      { name: "AbortError" }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
