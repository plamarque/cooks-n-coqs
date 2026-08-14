import assert from "node:assert/strict";
import test from "node:test";
import { bffImportService } from "../src/services/import-service";
import { RECIPE_SHARE_F2_CTA } from "../src/utils/recipe-share-f2";

/** Même fixture que recipe-share-f2.test.ts / preview-messagerie-tiramisu.md */
const TIRAMISU_F2_TEXT = [
  "Titre:",
  "Tiramisu",
  "",
  "Portions:",
  "6",
  "",
  "Ingrédients:",
  "- 500 g mascarpone",
  "- 4 œufs",
  "- 100 g sucre",
  "- 24 biscuits à la cuillère",
  "- 30 cl café serré",
  "- 2 c.à.s cacao amer",
  "",
  "Étapes:",
  "1. Séparer les blancs des jaunes.",
  "2. Blanchir les jaunes avec le sucre.",
  "3. Incorporer le mascarpone.",
  "4. Monter les blancs en neige et plier.",
  "5. Tremper les biscuits dans le café, alterner couches.",
  "6. Saupoudrer de cacao et réserver au frais 4 h.",
  "",
  "Source:",
  "https://example.com/tiramisu",
  "",
  RECIPE_SHARE_F2_CTA
].join("\n");

function withMockedFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): { restore: () => void; callCount: () => number } {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    return handler(input, init);
  };
  return {
    restore: () => {
      globalThis.fetch = original;
    },
    callCount: () => calls
  };
}

test("importFromText F2 Tiramisu — draft local, 0 fetch", async () => {
  const mock = withMockedFetch(async () => {
    throw new Error("fetch ne doit pas être appelé pour F2");
  });
  try {
    const draft = await bffImportService.importFromText(TIRAMISU_F2_TEXT);
    assert.equal(draft.title, "Tiramisu");
    assert.equal(draft.servingsBase, 6);
    assert.equal(draft.ingredients.length, 6);
    assert.equal(draft.steps.length, 6);
    assert.equal(draft.source?.url, "https://example.com/tiramisu");
    assert.equal(draft.source?.type, "TEXT");
    assert.equal(mock.callCount(), 0);
  } finally {
    mock.restore();
  }
});

test("importFromShare F2 Tiramisu — draft local SHARE, 0 fetch", async () => {
  const mock = withMockedFetch(async () => {
    throw new Error("fetch ne doit pas être appelé pour F2");
  });
  try {
    const draft = await bffImportService.importFromShare({ text: TIRAMISU_F2_TEXT });
    assert.equal(draft.title, "Tiramisu");
    assert.equal(draft.ingredients.length, 6);
    assert.equal(draft.steps.length, 6);
    assert.equal(draft.source?.type, "SHARE");
    assert.equal(draft.source?.url, "https://example.com/tiramisu");
    assert.equal(mock.callCount(), 0);
  } finally {
    mock.restore();
  }
});

test("importFromText non-F2 — fetch BFF appelé", async () => {
  const mock = withMockedFetch(async () => {
    return new Response(
      JSON.stringify({
        title: "Depuis BFF",
        category: "SALE",
        ingredients: [],
        steps: [{ id: "s1", order: 1, text: "Mélanger." }]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  });
  try {
    const draft = await bffImportService.importFromText("Voici ma super soupe à l'oignon");
    assert.equal(mock.callCount(), 1);
    assert.equal(draft.title, "Depuis BFF");
  } finally {
    mock.restore();
  }
});
