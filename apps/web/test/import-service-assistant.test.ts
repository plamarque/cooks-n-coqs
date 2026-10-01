import assert from "node:assert/strict";
import test from "node:test";
import { assistantImportAdapter } from "../src/services/import-service";

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
