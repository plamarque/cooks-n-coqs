import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCategoryExtractToDraft,
  buildCategoryExtractSnippet,
  classifyCategoryFromSignals,
  enrichMissingCategoryWithExtract,
  extractRecipeFromJsonLd,
  parseCategoryExtractPayload,
  parseRecipeWithCloud
} from "../src/parsing-client.js";
import type { ParsedRecipeDraft } from "../src/types.js";

function recipeHtml(
  recipe: Record<string, unknown>,
  bodyExtra = "",
  options?: { title?: string; meta?: string }
): string {
  const title = options?.title ?? (typeof recipe.name === "string" ? recipe.name : "Recette test");
  const meta = options?.meta ?? "Recette test";
  return `<!DOCTYPE html><html><head>
<meta name="description" content="${meta}" />
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: title,
    recipeIngredient: ["200 g farine"],
    recipeInstructions: ["Mélanger."],
    ...recipe,
    name: title
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

test("classifyCategoryFromSignals: dessert évident → SUCRE explicite", () => {
  const result = classifyCategoryFromSignals({ title: "Tiramisu aux fraises" });
  assert.equal(result.kind, "SUCRE");
  assert.equal(result.category, "SUCRE");
  assert.equal(result.explicit, true);
});

test("classifyCategoryFromSignals: salé évident → SALE explicite", () => {
  const result = classifyCategoryFromSignals({ title: "Poulet rôti" });
  assert.equal(result.kind, "SALE");
  assert.equal(result.category, "SALE");
  assert.equal(result.explicit, true);
});

test("classifyCategoryFromSignals: sans indices → none / SALE", () => {
  const result = classifyCategoryFromSignals({ title: "Bowl protéiné" });
  assert.equal(result.kind, "none");
  assert.equal(result.category, "SALE");
  assert.equal(result.explicit, false);
});

test("classifyCategoryFromSignals: signaux contradictoires → ambiguous", () => {
  const result = classifyCategoryFromSignals({
    title: "Quiche sucrée au chocolat",
    keywords: ["Dessert", "Main course"]
  });
  assert.equal(result.kind, "ambiguous");
  assert.equal(result.category, "SALE");
  assert.equal(result.explicit, false);
});

test("classifyCategoryFromSignals: keywords dessert → SUCRE", () => {
  const result = classifyCategoryFromSignals({
    title: "Spécialité maison",
    keywords: ["Dessert"]
  });
  assert.equal(result.kind, "SUCRE");
  assert.equal(result.explicit, true);
});

test("classifyCategoryFromSignals: titre avec accents → SUCRE", () => {
  const result = classifyCategoryFromSignals({ title: "Gâteau au chocolat" });
  assert.equal(result.kind, "SUCRE");
  assert.equal(result.explicit, true);
});

test("classifyCategoryFromSignals: keywords non-string ignorés", () => {
  const result = classifyCategoryFromSignals({
    title: "Bowl protéiné",
    // @ts-expect-error — robustesse runtime
    keywords: [null, 42, ""]
  });
  assert.equal(result.kind, "none");
});

test("extractRecipeFromJsonLd: recipeCategory Schema.org dessert → SUCRE", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml({ recipeCategory: "Dessert" }, "", { title: "Spécialité maison" }),
    "https://example.com/recipe-category"
  );
  assert.ok(draft);
  assert.equal(draft!.category, "SUCRE");
});

test("extractRecipeFromJsonLd: recipeCategory Schema.org tableau → SUCRE", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml({ recipeCategory: ["Dessert"] }, "", { title: "Spécialité maison" }),
    "https://example.com/recipe-category-array"
  );
  assert.ok(draft);
  assert.equal(draft!.category, "SUCRE");
});

test("extractRecipeFromJsonLd: meta description seule → SUCRE", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml({}, "", {
      title: "Spécialité maison",
      meta: "Un dessert familial pour le goûter"
    }),
    "https://example.com/meta-dessert"
  );
  assert.ok(draft);
  assert.equal(draft!.category, "SUCRE");
});

test("extractRecipeFromJsonLd: og:description seule (sans name=description) → SUCRE", () => {
  const title = "Spécialité maison";
  const html = `<!DOCTYPE html><html><head>
<meta property="og:description" content="Un dessert familial pour le goûter" />
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: title,
    recipeIngredient: ["200 g farine"],
    recipeInstructions: ["Mélanger."]
  })}</script>
</head><body><main></main></body></html>`;
  const draft = extractRecipeFromJsonLd(html, "https://example.com/og-meta-dessert");
  assert.ok(draft);
  assert.equal(draft!.category, "SUCRE");
});

test("extractRecipeFromJsonLd: titre dessert → SUCRE sans LLM", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml({}, "", { title: "Fondant au chocolat" }),
    "https://example.com/dessert"
  );
  assert.ok(draft);
  assert.equal(draft!.category, "SUCRE");
});

test("extractRecipeFromJsonLd: titre salé → SALE sans LLM", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml({}, "", { title: "Blanquette de veau" }),
    "https://example.com/sale"
  );
  assert.ok(draft);
  assert.equal(draft!.category, "SALE");
});

test("extractRecipeFromJsonLd: sans indices → SALE (défaut sûr)", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml({}, "", { title: "Bowl protéiné" }),
    "https://example.com/neutre"
  );
  assert.ok(draft);
  assert.equal(draft!.category, "SALE");
});

test("enrichMissingCategoryWithExtract: dessert explicite → pas d’appel extract", async () => {
  const draft = baseDraft({ title: "Tiramisu aux fraises", category: "SALE" });
  const html = recipeHtml({}, "", { title: "Tiramisu aux fraises" });
  let called = 0;
  const result = await enrichMissingCategoryWithExtract(draft, html, async () => {
    called += 1;
    return { category: "SALE" };
  });
  assert.equal(result.category, "SUCRE");
  assert.equal(called, 0);
});

test("enrichMissingCategoryWithExtract: salé explicite → pas d’appel extract", async () => {
  const draft = baseDraft({ title: "Quiche lorraine", category: "SUCRE" });
  const html = recipeHtml({}, "", { title: "Quiche lorraine" });
  let called = 0;
  const result = await enrichMissingCategoryWithExtract(draft, html, async () => {
    called += 1;
    return { category: "SUCRE" };
  });
  assert.equal(result.category, "SALE");
  assert.equal(called, 0);
});

test("enrichMissingCategoryWithExtract: ambigu + extract injecté → suit le filet", async () => {
  const draft = baseDraft({
    title: "Spécialité maison",
    category: "SALE"
  });
  const html = recipeHtml(
    { keywords: "Dessert, Main course" },
    "",
    { title: "Spécialité maison", meta: "Une recette maison" }
  );
  let called = 0;
  const result = await enrichMissingCategoryWithExtract(draft, html, async () => {
    called += 1;
    return { category: "SUCRE" };
  });
  assert.equal(called, 1);
  assert.equal(result.category, "SUCRE");
});

test("enrichMissingCategoryWithExtract: sans indices → SALE, pas d’extract", async () => {
  const draft = baseDraft({ title: "Bowl protéiné" });
  const html = recipeHtml({}, "", { title: "Bowl protéiné", meta: "Une assiette" });
  let called = 0;
  const result = await enrichMissingCategoryWithExtract(draft, html, async () => {
    called += 1;
    return { category: "SUCRE" };
  });
  assert.equal(result.category, "SALE");
  assert.equal(called, 0);
});

test("enrichMissingCategoryWithExtract: sans clé API + ambigu → SALE, pas d’exception", async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const draft = baseDraft({ title: "Spécialité maison" });
    const html = recipeHtml(
      { keywords: "Dessert, Main course" },
      "",
      { title: "Spécialité maison" }
    );
    const result = await enrichMissingCategoryWithExtract(draft, html);
    assert.equal(result.category, "SALE");
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("enrichMissingCategoryWithExtract: none ne réécrit pas un SUCRE déjà présent", async () => {
  const draft = baseDraft({ title: "Bowl protéiné", category: "SUCRE" });
  const html = recipeHtml({}, "", { title: "Bowl protéiné", meta: "Une assiette" });
  let called = 0;
  const result = await enrichMissingCategoryWithExtract(draft, html, async () => {
    called += 1;
    return { category: "SALE" };
  });
  assert.equal(result.category, "SUCRE");
  assert.equal(called, 0);
});

test("enrichMissingCategoryWithExtract: non-écrasement catégorie déjà explicite", async () => {
  const draft = baseDraft({ title: "Tiramisu", category: "SUCRE" });
  const html = recipeHtml({}, "", { title: "Tiramisu" });
  let called = 0;
  const result = await enrichMissingCategoryWithExtract(draft, html, async () => {
    called += 1;
    return { category: "SALE" };
  });
  assert.equal(result.category, "SUCRE");
  assert.equal(called, 0);
});

test("enrichMissingCategoryWithExtract: échec extract → conserve draft, soft-fail", async () => {
  const draft = baseDraft({
    title: "Spécialité maison",
    category: "SALE"
  });
  const html = recipeHtml(
    { keywords: "Dessert, Main course" },
    "",
    { title: "Spécialité maison" }
  );
  const soft = await enrichMissingCategoryWithExtract(draft, html, async () => null);
  assert.equal(soft.category, "SALE");

  const afterThrow = await enrichMissingCategoryWithExtract(draft, html, async () => {
    throw new Error("API down");
  });
  assert.equal(afterThrow.category, "SALE");
});

test("parseCategoryExtractPayload / applyCategoryExtractToDraft", () => {
  const payload = parseCategoryExtractPayload('```json\n{"category": "SUCRE"}\n```');
  assert.deepEqual(payload, { category: "SUCRE" });
  const merged = applyCategoryExtractToDraft(baseDraft(), payload);
  assert.equal(merged.category, "SUCRE");
  assert.equal(parseCategoryExtractPayload("[1,2,3]"), null);
  assert.equal(applyCategoryExtractToDraft(baseDraft(), { category: "AUTRE" }).category, "SALE");
  assert.equal(
    applyCategoryExtractToDraft(baseDraft(), { category: "Sucré" }).category,
    "SUCRE"
  );
});

test("buildCategoryExtractSnippet: extrait court titre+meta, pas la page entière", () => {
  const long = "x".repeat(4000);
  const html = recipeHtml({}, `<p>${long}</p>`, {
    title: "Bowl protéiné",
    meta: "Meta courte catégorie"
  });
  const snippet = buildCategoryExtractSnippet(html, "Bowl protéiné");
  assert.ok(snippet.includes("Bowl protéiné"));
  assert.ok(snippet.includes("Meta courte"));
  assert.ok(snippet.length <= 1500);
});

test("parseRecipeWithCloud URL JSON-LD: dessert sans clé → SUCRE", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const html = recipeHtml({}, "", { title: "Tiramisu aux fraises" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    const draft = await parseRecipeWithCloud({
      sourceType: "URL",
      url: "https://example.com/tiramisu"
    });
    assert.equal(draft.category, "SUCRE");
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("parseRecipeWithCloud SHARE JSON-LD: salé sans clé → SALE", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const html = recipeHtml({}, "", { title: "Poulet rôti" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    const draft = await parseRecipeWithCloud({
      sourceType: "SHARE",
      url: "https://example.com/poulet",
      shareTitle: "Poulet rôti"
    });
    assert.equal(draft.category, "SALE");
    assert.equal(draft.source?.type, "SHARE");
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("parseRecipeWithCloud URL JSON-LD: ambigu + categoryExtractFn → filet", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const html = recipeHtml(
    { keywords: "Dessert, Main course" },
    "",
    { title: "Spécialité maison" }
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    let called = 0;
    const draft = await parseRecipeWithCloud({
      sourceType: "URL",
      url: "https://example.com/ambigu",
      categoryExtractFn: async () => {
        called += 1;
        return { category: "SUCRE" };
      }
    });
    assert.equal(called, 1);
    assert.equal(draft.category, "SUCRE");
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("parseRecipeWithCloud SHARE JSON-LD: ambigu + categoryExtractFn → filet", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const html = recipeHtml(
    { keywords: "Dessert, Main course" },
    "",
    { title: "Spécialité maison" }
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    let called = 0;
    const draft = await parseRecipeWithCloud({
      sourceType: "SHARE",
      url: "https://example.com/ambigu-share",
      shareTitle: "Spécialité maison",
      categoryExtractFn: async () => {
        called += 1;
        return { category: "SUCRE" };
      }
    });
    assert.equal(called, 1);
    assert.equal(draft.category, "SUCRE");
    assert.equal(draft.source?.type, "SHARE");
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("classifyCategoryFromSignals: expression multi-mots sans faux positif sous-chaîne", () => {
  // « plat » seul ne doit pas matcher « plat principal » ; « principal plat » non plus en sous-chaîne collée
  const noHit = classifyCategoryFromSignals({ title: "Bowl protéiné plat" });
  assert.equal(noHit.kind, "none");
  const hit = classifyCategoryFromSignals({ title: "Mon plat principal maison" });
  assert.equal(hit.kind, "SALE");
  assert.equal(hit.explicit, true);
});

test("enrichMissingCategoryWithExtract: SUCRE amont + ambigu page-wide → pas d’écrasement extract", async () => {
  const draft = baseDraft({ title: "Spécialité maison", category: "SUCRE" });
  const html = recipeHtml(
    { keywords: "Dessert, Main course" },
    "",
    { title: "Spécialité maison", meta: "Une recette maison" }
  );
  let called = 0;
  const result = await enrichMissingCategoryWithExtract(draft, html, async () => {
    called += 1;
    return { category: "SALE" };
  });
  assert.equal(result.category, "SUCRE");
  assert.equal(called, 0);
});

test("enrichMissingCategoryWithExtract: titre univoque malgré keywords page ambigus → aligne sans extract", async () => {
  const draft = baseDraft({ title: "Tiramisu aux fraises", category: "SALE" });
  const html = recipeHtml(
    { keywords: "Dessert, Main course" },
    "",
    { title: "Tiramisu aux fraises", meta: "Une recette" }
  );
  let called = 0;
  const result = await enrichMissingCategoryWithExtract(draft, html, async () => {
    called += 1;
    return { category: "SALE" };
  });
  assert.equal(result.category, "SUCRE");
  assert.equal(called, 0);
});

test("parseRecipeWithCloud URL JSON-LD @graph: ambigu + categoryExtractFn → filet", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const title = "Spécialité maison";
  const html = `<!DOCTYPE html><html><head>
<meta name="description" content="Une recette maison" />
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Recipe",
        name: title,
        keywords: "Dessert, Main course",
        recipeIngredient: ["200 g farine"],
        recipeInstructions: ["Mélanger."]
      }
    ]
  })}</script>
</head><body><main></main></body></html>`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    let called = 0;
    const draft = await parseRecipeWithCloud({
      sourceType: "URL",
      url: "https://example.com/ambigu-graph",
      categoryExtractFn: async () => {
        called += 1;
        return { category: "SUCRE" };
      }
    });
    assert.equal(called, 1);
    assert.equal(draft.category, "SUCRE");
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("parseRecipeWithCloud URL JSON-LD tableau racine: ambigu + categoryExtractFn → filet", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const title = "Spécialité maison";
  const html = `<!DOCTYPE html><html><head>
<meta name="description" content="Une recette maison" />
<script type="application/ld+json">${JSON.stringify([
    {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: title,
      keywords: "Dessert, Main course",
      recipeIngredient: ["200 g farine"],
      recipeInstructions: ["Mélanger."]
    }
  ])}</script>
</head><body><main></main></body></html>`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    let called = 0;
    const draft = await parseRecipeWithCloud({
      sourceType: "URL",
      url: "https://example.com/ambigu-array",
      categoryExtractFn: async () => {
        called += 1;
        return { category: "SUCRE" };
      }
    });
    assert.equal(called, 1);
    assert.equal(draft.category, "SUCRE");
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("parseRecipeWithCloud URL JSON-LD: recipeCategory seul → SUCRE", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const html = recipeHtml(
    { recipeCategory: "Dessert" },
    "",
    { title: "Spécialité maison", meta: "Une assiette" }
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    const draft = await parseRecipeWithCloud({
      sourceType: "URL",
      url: "https://example.com/schema-category"
    });
    assert.equal(draft.category, "SUCRE");
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});
