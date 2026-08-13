import assert from "node:assert/strict";
import test from "node:test";
import {
  applyTimesExtractToDraft,
  buildTimesExtractSnippet,
  enrichMissingRecipeTimesWithExtract,
  extractRecipeFromJsonLd,
  extractTimesFromHtml,
  parseFrDurationToMinutes,
  parseRecipeWithCloud,
  parseTimesExtractPayload
} from "../src/parsing-client.js";
import type { ParsedRecipeDraft } from "../src/types.js";

function recipeHtml(recipe: Record<string, unknown>, bodyExtra = ""): string {
  return `<!DOCTYPE html><html><head>
<meta name="description" content="Recette test" />
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Recette test",
    recipeIngredient: ["200 g farine"],
    recipeInstructions: ["Mélanger."],
    ...recipe
  })}</script>
</head><body><main>${bodyExtra}</main></body></html>`;
}

function baseDraft(overrides: Partial<ParsedRecipeDraft> = {}): ParsedRecipeDraft {
  return {
    title: "Recette test",
    category: "SALE",
    ingredients: [{ id: "ing-1", label: "farine", isScalable: false }],
    steps: [{ id: "step-1", order: 1, text: "Mélanger." }],
    ...overrides
  };
}

test("parseFrDurationToMinutes: min, heures, compact, une nuit", () => {
  assert.equal(parseFrDurationToMinutes("20 min"), 20);
  assert.equal(parseFrDurationToMinutes("45 minutes"), 45);
  assert.equal(parseFrDurationToMinutes("2 h"), 120);
  assert.equal(parseFrDurationToMinutes("1h30"), 90);
  assert.equal(parseFrDurationToMinutes("1 h 30 min"), 90);
  assert.equal(parseFrDurationToMinutes("une nuit"), 480);
  assert.equal(parseFrDurationToMinutes("rien"), undefined);
});

test("parseFrDurationToMinutes: plage → borne haute", () => {
  assert.equal(parseFrDurationToMinutes("20 à 25 min"), 25);
  assert.equal(parseFrDurationToMinutes("20-25 minutes"), 25);
  assert.equal(parseFrDurationToMinutes("1 h à 2 h"), 120);
});

test("parseFrDurationToMinutes: rejette minutes >= 60, décimales, plages invalides", () => {
  assert.equal(parseFrDurationToMinutes("1h99"), undefined);
  assert.equal(parseFrDurationToMinutes("1.5 h"), undefined);
  assert.equal(parseFrDurationToMinutes("1,5 h"), undefined);
  assert.equal(parseFrDurationToMinutes("25 à 20 min"), undefined);
  assert.equal(parseFrDurationToMinutes("20 à 25 h"), undefined);
});

test("extractTimesFromHtml: motifs FR préparation / cuisson / repos", () => {
  const times = extractTimesFromHtml(
    "<p>Préparation : 20 min</p><p>Cuisson 45 minutes</p><p>Repos 2 h</p>"
  );
  assert.equal(times.prepTimeMin, 20);
  assert.equal(times.cookTimeMin, 45);
  assert.equal(times.restTimeMin, 120);
});

test("extractTimesFromHtml: meta description seule (hors body)", () => {
  const html = `<!DOCTYPE html><html><head>
<meta name="description" content="Préparation : 18 min. Cuisson 40 minutes. Repos 1 h." />
</head><body><main><p>Aucune durée dans le corps.</p></main></body></html>`;
  const times = extractTimesFromHtml(html);
  assert.equal(times.prepTimeMin, 18);
  assert.equal(times.cookTimeMin, 40);
  assert.equal(times.restTimeMin, 60);
});

test("extractTimesFromHtml: ignore première capture invalide, prend la suivante", () => {
  const times = extractTimesFromHtml(
    "<p>Cuisson : 1h99</p><p>Cuisson : 30 min</p>"
  );
  assert.equal(times.cookTimeMin, 30);
});

test("extractTimesFromHtml: fermentation une nuit → rest 480", () => {
  const times = extractTimesFromHtml("<p>Fermentation une nuit</p>");
  assert.equal(times.restTimeMin, 480);
});

test("extractTimesFromHtml: « une nuit » hors repos/fermentation → pas de rest", () => {
  const times = extractTimesFromHtml(
    "<p>Laisser reposer le mélange une nuit au frigo avant de servir.</p>"
  );
  assert.equal(times.restTimeMin, undefined);
});

test("extractTimesFromHtml: précuisson ne set pas cook", () => {
  const times = extractTimesFromHtml("<p>Précuisson 10 min au micro-ondes.</p>");
  assert.equal(times.cookTimeMin, undefined);
  assert.equal(times.prepTimeMin, undefined);
});

test("extractTimesFromHtml: pré-cuisson (avec tiret) ne set pas cook", () => {
  const times = extractTimesFromHtml("<p>Pré-cuisson 10 min au micro-ondes.</p>");
  assert.equal(times.cookTimeMin, undefined);
});

test("extractTimesFromHtml: Préparation de N min", () => {
  const times = extractTimesFromHtml(
    "<p>Préparation de 20 min</p><p>Cuisson de 45 minutes</p>"
  );
  assert.equal(times.prepTimeMin, 20);
  assert.equal(times.cookTimeMin, 45);
});

test("extractTimesFromHtml: plage après libellé → borne haute", () => {
  const times = extractTimesFromHtml("<p>Cuisson : 20 à 25 min</p>");
  assert.equal(times.cookTimeMin, 25);
});

test("extractTimesFromHtml: plage horaires après libellé → borne haute", () => {
  const times = extractTimesFromHtml("<p>Repos : 1 h à 2 h</p>");
  assert.equal(times.restTimeMin, 120);
});

test("extractTimesFromHtml: entités HTML (Pr&eacute;paration)", () => {
  const times = extractTimesFromHtml("<p>Pr&eacute;paration : 15 min</p>");
  assert.equal(times.prepTimeMin, 15);
});

test("extractRecipeFromJsonLd: ISO Schema.org → minutes, pas d’écrasement HTML", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml(
      { prepTime: "PT15M", cookTime: "PT30M" },
      "<p>Préparation : 99 min</p><p>Cuisson 99 minutes</p>"
    ),
    "https://example.com/r"
  );
  assert.ok(draft);
  assert.equal(draft!.prepTimeMin, 15);
  assert.equal(draft!.cookTimeMin, 30);
});

test("extractRecipeFromJsonLd: ISO PT20S (=0 min) laisse le fallback HTML", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml(
      { prepTime: "PT20S" },
      "<p>Préparation : 20 min</p>"
    ),
    "https://example.com/r"
  );
  assert.ok(draft);
  assert.equal(draft!.prepTimeMin, 20);
});

test("extractRecipeFromJsonLd: motifs FR HTML sans ISO → trois champs sans LLM", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml(
      {},
      "<p>Préparation : 20 min</p><p>Cuisson 45 minutes</p><p>Repos 2 h</p>"
    ),
    "https://example.com/r"
  );
  assert.ok(draft);
  assert.equal(draft!.prepTimeMin, 20);
  assert.equal(draft!.cookTimeMin, 45);
  assert.equal(draft!.restTimeMin, 120);
});

test("extractRecipeFromJsonLd: ISO prep + HTML cuisson seulement → prep conservé", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml(
      { prepTime: "PT20M" },
      "<p>Préparation : 5 min</p><p>Cuisson 45 minutes</p>"
    ),
    "https://example.com/r"
  );
  assert.ok(draft);
  assert.equal(draft!.prepTimeMin, 20);
  assert.equal(draft!.cookTimeMin, 45);
});

test("extractRecipeFromJsonLd: aucune indication → temps undefined", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml({}, "<p>Une bonne recette sans durée.</p>"),
    "https://example.com/r"
  );
  assert.ok(draft);
  assert.equal(draft!.prepTimeMin, undefined);
  assert.equal(draft!.cookTimeMin, undefined);
  assert.equal(draft!.restTimeMin, undefined);
});

test("chemin public JSON-LD + enrich (comme parseRecipeWithCloud) sans clé → undefined", async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const html = recipeHtml({}, "<p>Formulation atypique sans motif.</p>");
    const draft = extractRecipeFromJsonLd(html, "https://example.com/r");
    assert.ok(draft);
    const enriched = await enrichMissingRecipeTimesWithExtract(draft!, html);
    assert.equal(enriched.prepTimeMin, undefined);
    assert.equal(enriched.cookTimeMin, undefined);
    assert.equal(enriched.restTimeMin, undefined);
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("enrichMissingRecipeTimesWithExtract: sans clé API → champs undefined, pas d’appel", async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const draft = baseDraft();
    const html = recipeHtml({}, "<p>Aucune durée claire.</p>");
    const result = await enrichMissingRecipeTimesWithExtract(draft, html);
    assert.equal(result.prepTimeMin, undefined);
    assert.equal(result.cookTimeMin, undefined);
    assert.equal(result.restTimeMin, undefined);
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("enrichMissingRecipeTimesWithExtract: filet extract remplit uniquement les trous", async () => {
  const draft = baseDraft({ prepTimeMin: 15 });
  const html = recipeHtml({}, "<p>Formulation atypique sans motif standard.</p>");
  const result = await enrichMissingRecipeTimesWithExtract(draft, html, async () => ({
    prepTimeMin: 99,
    cookTimeMin: 45,
    restTimeMin: 120
  }));
  assert.equal(result.prepTimeMin, 15);
  assert.equal(result.cookTimeMin, 45);
  assert.equal(result.restTimeMin, 120);
});

test("enrichMissingRecipeTimesWithExtract: 0 traité comme trou pour le filet", async () => {
  const draft = baseDraft({ prepTimeMin: 0 as unknown as number, cookTimeMin: 0 });
  const html = recipeHtml({}, "<p>Formulation atypique.</p>");
  const result = await enrichMissingRecipeTimesWithExtract(draft, html, async () => ({
    prepTimeMin: 12,
    cookTimeMin: 30,
    restTimeMin: null
  }));
  assert.equal(result.prepTimeMin, 12);
  assert.equal(result.cookTimeMin, 30);
});

test("enrichMissingRecipeTimesWithExtract: échec extract → draft inchangé, pas de throw", async () => {
  const draft = baseDraft();
  const html = recipeHtml({}, "<p>Formulation atypique.</p>");
  const soft = await enrichMissingRecipeTimesWithExtract(draft, html, async () => null);
  assert.equal(soft.prepTimeMin, undefined);
  assert.equal(soft.cookTimeMin, undefined);
  assert.equal(soft.restTimeMin, undefined);

  const afterThrow = await enrichMissingRecipeTimesWithExtract(draft, html, async () => {
    throw new Error("API down");
  });
  assert.equal(afterThrow.prepTimeMin, undefined);
  assert.equal(afterThrow.cookTimeMin, undefined);
  assert.equal(afterThrow.restTimeMin, undefined);
});

test("applyTimesExtractToDraft / parseTimesExtractPayload", () => {
  const payload = parseTimesExtractPayload(
    '```json\n{"prepTimeMin": 10, "cookTimeMin": null, "restTimeMin": 60}\n```'
  );
  assert.deepEqual(payload, { prepTimeMin: 10, cookTimeMin: null, restTimeMin: 60 });
  const merged = applyTimesExtractToDraft(baseDraft({ cookTimeMin: 5 }), payload);
  assert.equal(merged.prepTimeMin, 10);
  assert.equal(merged.cookTimeMin, 5);
  assert.equal(merged.restTimeMin, 60);
});

test("parseTimesExtractPayload: fence ```JSON et rejet non-objet", () => {
  const payload = parseTimesExtractPayload(
    '```JSON\n{"prepTimeMin": 8, "cookTimeMin": null, "restTimeMin": null}\n```'
  );
  assert.deepEqual(payload, { prepTimeMin: 8, cookTimeMin: null, restTimeMin: null });
  assert.equal(parseTimesExtractPayload("[1,2,3]"), null);
  assert.equal(parseTimesExtractPayload("42"), null);
});

test("applyTimesExtractToDraft: string numérique LLM « 45 »", () => {
  const merged = applyTimesExtractToDraft(baseDraft(), {
    prepTimeMin: "45" as unknown as number,
    cookTimeMin: null,
    restTimeMin: null
  });
  assert.equal(merged.prepTimeMin, 45);
});

test("buildTimesExtractSnippet: extrait court meta + main, pas la page entière", () => {
  const long = "x".repeat(4000);
  const html = `<!DOCTYPE html><html><head>
<meta name="description" content="Meta courte" />
</head><body><main>Corps ${long}</main></body></html>`;
  const snippet = buildTimesExtractSnippet(html);
  assert.ok(snippet.includes("Meta courte"));
  assert.ok(snippet.length <= 2500);
});

test("buildTimesExtractSnippet: ignore script et main vide → article", () => {
  const html = `<!DOCTYPE html><html><head>
<meta name="description" content="Meta" />
</head><body>
<main>   <script>var t="Cuisson 999 min";</script>   </main>
<article>Cuisson 30 min au four</article>
</body></html>`;
  const snippet = buildTimesExtractSnippet(html);
  assert.ok(snippet.includes("Cuisson 30 min"));
  assert.ok(!snippet.includes("999"));
});

test("parseRecipeWithCloud URL JSON-LD: motifs FR via fetch mocké", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const html = recipeHtml(
    {},
    "<p>Préparation : 20 min</p><p>Cuisson 45 minutes</p><p>Repos 2 h</p>"
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    const draft = await parseRecipeWithCloud({
      sourceType: "URL",
      url: "https://example.com/recette-temps"
    });
    assert.equal(draft.prepTimeMin, 20);
    assert.equal(draft.cookTimeMin, 45);
    assert.equal(draft.restTimeMin, 120);
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("parseRecipeWithCloud SHARE JSON-LD: motifs FR via fetch mocké", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const html = recipeHtml({}, "<p>Préparation de 15 min</p><p>Cuisson : 1 h à 2 h</p>");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    const draft = await parseRecipeWithCloud({
      sourceType: "SHARE",
      url: "https://example.com/share-temps",
      shareTitle: "Partage test"
    });
    assert.equal(draft.prepTimeMin, 15);
    assert.equal(draft.cookTimeMin, 120);
    assert.equal(draft.source?.type, "SHARE");
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("parseRecipeWithCloud URL JSON-LD: filet extract injecté remplit les trous", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const html = recipeHtml({}, "<p>Formulation atypique sans motif standard.</p>");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    const draft = await parseRecipeWithCloud({
      sourceType: "URL",
      url: "https://example.com/recette-extract",
      timesExtractFn: async () => ({
        prepTimeMin: 12,
        cookTimeMin: 40,
        restTimeMin: 90
      })
    });
    assert.equal(draft.prepTimeMin, 12);
    assert.equal(draft.cookTimeMin, 40);
    assert.equal(draft.restTimeMin, 90);
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("parseRecipeWithCloud SHARE JSON-LD: filet extract injecté ne écrase pas l’ISO", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const html = recipeHtml(
    { prepTime: "PT15M" },
    "<p>Formulation atypique sans motif.</p>"
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    const draft = await parseRecipeWithCloud({
      sourceType: "SHARE",
      url: "https://example.com/share-extract",
      shareTitle: "Partage extract",
      timesExtractFn: async () => ({
        prepTimeMin: 99,
        cookTimeMin: 45,
        restTimeMin: null
      })
    });
    assert.equal(draft.prepTimeMin, 15);
    assert.equal(draft.cookTimeMin, 45);
    assert.equal(draft.restTimeMin, undefined);
    assert.equal(draft.source?.type, "SHARE");
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});
