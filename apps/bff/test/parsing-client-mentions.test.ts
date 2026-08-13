import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMentionsExtractToDraft,
  enrichStepIngredientMentions,
  parseMentionsExtractPayload,
  parseRecipeWithCloud,
  resolveStepIngredientIdsHeuristic,
  stepMentionsIngredient,
  normalizeForIngredientMatching
} from "../src/parsing-client.js";
import type { MentionsExtractPayload } from "../src/parsing-client.js";
import type { ParsedRecipeDraft } from "../src/types.js";

function baseDraft(overrides: Partial<ParsedRecipeDraft> = {}): ParsedRecipeDraft {
  return {
    title: "Pâte brisée",
    category: "SUCRE",
    ingredients: [
      { id: "ing-farine", label: "farine", isScalable: true },
      { id: "ing-beurre", label: "beurre", isScalable: true },
      { id: "ing-eau", label: "eau froide", isScalable: false }
    ],
    steps: [
      { id: "step-1", order: 1, text: "Ajouter la farine et le beurre." },
      { id: "step-2", order: 2, text: "Ajoutez-les ensuite." }
    ],
    ...overrides
  };
}

test("heuristique tokens: étape cite farine → id farine", () => {
  const ids = resolveStepIngredientIdsHeuristic("Ajouter la farine", [
    { id: "ing-farine", label: "farine", isScalable: true },
    { id: "ing-sel", label: "sel", isScalable: false }
  ]);
  assert.deepEqual(ids, ["ing-farine"]);
});

test("heuristique tokens: pronom / ellipse → []", () => {
  const draft = baseDraft();
  const ids = resolveStepIngredientIdsHeuristic("Ajoutez-les ensuite.", draft.ingredients);
  assert.deepEqual(ids, []);
});

test("stepMentionsIngredient: label multi-mots et pluriel", () => {
  const normalized = normalizeForIngredientMatching("Mélanger avec de l huile");
  assert.equal(stepMentionsIngredient(normalized, "huile d'olive"), true);
  assert.equal(stepMentionsIngredient(normalized, "oeufs"), false);
});

test("enrichStepIngredientMentions: injection appelée seulement pour étapes non résolues", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  let extractCalls = 0;
  try {
    const out = await enrichStepIngredientMentions(baseDraft(), async () => {
      extractCalls += 1;
      return null;
    });
    assert.ok(out.steps[0]?.ingredientIds?.includes("ing-farine"));
    assert.ok(out.steps[0]?.ingredientIds?.includes("ing-beurre"));
    assert.equal(out.steps[1]?.ingredientIds?.length ?? 0, 0);
    assert.equal(extractCalls, 1);
  } finally {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("enrichStepIngredientMentions: sans clé ni injection → pas d’appel, heuristique seule", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const out = await enrichStepIngredientMentions(baseDraft());
    assert.ok(out.steps[0]?.ingredientIds?.includes("ing-farine"));
    assert.equal(out.steps[1]?.ingredientIds, undefined);
  } finally {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("enrichStepIngredientMentions: extract injecté sur étape non résolue", async () => {
  let extractCalls = 0;
  const out = await enrichStepIngredientMentions(baseDraft(), async (input) => {
    extractCalls += 1;
    assert.equal(input.steps.length, 1);
    assert.equal(input.steps[0]?.id, "step-2");
    assert.ok(input.ingredients.some((i) => i.id === "ing-farine"));
    return {
      mentions: [{ stepId: "step-2", ingredientIds: ["ing-farine", "ing-beurre"] }]
    };
  });
  assert.equal(extractCalls, 1);
  assert.ok(out.steps[0]?.ingredientIds?.includes("ing-farine"));
  assert.deepEqual(out.steps[1]?.ingredientIds, ["ing-farine", "ing-beurre"]);
});

test("enrichStepIngredientMentions: étape déjà résolue → pas d’appel extract pour elle", async () => {
  let seenStepIds: string[] = [];
  const draft = baseDraft({
    steps: [
      { id: "step-1", order: 1, text: "Ajouter la farine." },
      { id: "step-2", order: 2, text: "Cuire 10 min." }
    ]
  });
  await enrichStepIngredientMentions(draft, async (input) => {
    seenStepIds = input.steps.map((s) => s.id);
    return { mentions: [] };
  });
  assert.ok(!seenStepIds.includes("step-1"));
  assert.deepEqual(seenStepIds, ["step-2"]);
});

test("enrichStepIngredientMentions: soft-fail extract → ids heuristiques, pas de throw", async () => {
  const softNull = await enrichStepIngredientMentions(baseDraft(), async () => null);
  assert.ok(softNull.steps[0]?.ingredientIds?.includes("ing-farine"));
  assert.equal(softNull.steps[1]?.ingredientIds, undefined);

  const softThrow = await enrichStepIngredientMentions(baseDraft(), async () => {
    throw new Error("API down");
  });
  assert.ok(softThrow.steps[0]?.ingredientIds?.includes("ing-farine"));
  assert.equal(softThrow.steps[1]?.ingredientIds, undefined);
});

test("enrichStepIngredientMentions: sans ingrédients / texte vide → pas d’extract", async () => {
  let calls = 0;
  const emptyIng = await enrichStepIngredientMentions(
    baseDraft({
      ingredients: [],
      steps: [
        {
          id: "s1",
          order: 1,
          text: "Mélanger.",
          ingredientIds: ["stale-id"]
        }
      ]
    }),
    async () => {
      calls += 1;
      return null;
    }
  );
  assert.equal(calls, 0);
  assert.equal(emptyIng.steps[0]?.ingredientIds, undefined);

  const emptyText = await enrichStepIngredientMentions(
    baseDraft({
      steps: [
        { id: "s1", order: 1, text: "   " },
        { id: "s2", order: 2, text: "Réserver le mélange au frais." }
      ]
    }),
    async (input) => {
      calls += 1;
      assert.ok(!input.steps.some((s) => s.id === "s1"));
      assert.deepEqual(
        input.steps.map((s) => s.id),
        ["s2"]
      );
      return null;
    }
  );
  assert.equal(calls, 1);
  assert.equal(emptyText.steps[1]?.ingredientIds, undefined);
});

test("applyMentionsExtractToDraft / parseMentionsExtractPayload", () => {
  const payload = parseMentionsExtractPayload(
    '```json\n{"mentions":[{"stepId":"step-2","ingredientIds":["ing-farine","inconnu"]}]}\n```'
  );
  assert.deepEqual(payload, {
    mentions: [{ stepId: "step-2", ingredientIds: ["ing-farine", "inconnu"] }]
  });
  const withHeuristic = {
    ...baseDraft(),
    steps: [
      { id: "step-1", order: 1, text: "Ajouter la farine.", ingredientIds: ["ing-farine"] },
      { id: "step-2", order: 2, text: "Ajoutez-les ensuite." }
    ]
  };
  const merged = applyMentionsExtractToDraft(withHeuristic, payload);
  assert.deepEqual(merged.steps[1]?.ingredientIds, ["ing-farine"]);
  assert.deepEqual(merged.steps[0]?.ingredientIds, ["ing-farine"]);
});

test("applyMentionsExtractToDraft: mentions non-array → draft inchangé", () => {
  const draft = baseDraft();
  const out = applyMentionsExtractToDraft(draft, {
    mentions: "bad" as unknown as MentionsExtractPayload["mentions"]
  });
  assert.equal(out, draft);
});

test("applyMentionsExtractToDraft: stepId dupliqués → union des ids", () => {
  const draft = baseDraft();
  const merged = applyMentionsExtractToDraft(draft, {
    mentions: [
      { stepId: "step-2", ingredientIds: ["ing-farine"] },
      { stepId: "step-2", ingredientIds: ["ing-beurre", "inconnu"] }
    ]
  });
  assert.deepEqual(merged.steps[1]?.ingredientIds, ["ing-farine", "ing-beurre"]);
});

test("applyMentionsExtractToDraft: trim stepId et ingredientIds", () => {
  const draft = baseDraft();
  const merged = applyMentionsExtractToDraft(draft, {
    mentions: [
      {
        stepId: "  step-2  ",
        ingredientIds: ["  ing-farine  ", "ing-beurre", "  "]
      }
    ]
  });
  assert.deepEqual(merged.steps[1]?.ingredientIds, ["ing-farine", "ing-beurre"]);
});

test("resolveStepIngredientIdsHeuristic: dédup ids si doublons ingredients", () => {
  const ids = resolveStepIngredientIdsHeuristic("Ajouter la farine.", [
    { id: "ing-farine", label: "farine", isScalable: true },
    { id: "ing-farine", label: "farine T45", isScalable: true }
  ]);
  assert.deepEqual(ids, ["ing-farine"]);
});

test("enrichStepIngredientMentions: step.text null → heuristique sans throw", async () => {
  const draft = baseDraft({
    steps: [
      // @ts-expect-error — robustesse runtime
      { id: "s-null", order: 1, text: null },
      { id: "s-ok", order: 2, text: "Ajouter la farine." }
    ]
  });
  const out = await enrichStepIngredientMentions(draft);
  assert.equal(out.steps[0]?.ingredientIds, undefined);
  assert.ok(out.steps[1]?.ingredientIds?.includes("ing-farine"));
});

test("parseRecipeWithCloud URL JSON-LD: heuristique mentions sans clé", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const html = `<!DOCTYPE html><html><head>
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Pâte",
    recipeIngredient: ["200 g farine", "100 g beurre"],
    recipeInstructions: ["Ajouter la farine.", "Ajoutez-les ensuite."]
  })}</script>
</head><body></body></html>`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  try {
    const draft = await parseRecipeWithCloud({
      sourceType: "URL",
      url: "https://example.com/pate"
    });
    const farine = draft.ingredients.find((i) => /farine/i.test(i.label));
    assert.ok(farine);
    const step1 = draft.steps.find((s) => /farine/i.test(s.text));
    assert.ok(step1?.ingredientIds?.includes(farine!.id));
    const step2 = draft.steps.find((s) => /Ajoutez-les/i.test(s.text));
    assert.equal(step2?.ingredientIds?.length ?? 0, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("parseRecipeWithCloud: mentionsExtractFn injecté sur ellipse", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const html = `<!DOCTYPE html><html><head>
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Pâte",
    recipeIngredient: ["200 g farine", "100 g beurre"],
    recipeInstructions: ["Ajouter la farine et le beurre.", "Ajoutez-les ensuite."]
  })}</script>
</head><body></body></html>`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(html, { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  let extractCalls = 0;
  try {
    const draft = await parseRecipeWithCloud({
      sourceType: "URL",
      url: "https://example.com/pate-extract",
      mentionsExtractFn: async (input) => {
        extractCalls += 1;
        const farine = input.ingredients.find((i) => /farine/i.test(i.label));
        const beurre = input.ingredients.find((i) => /beurre/i.test(i.label));
        const step = input.steps.find((s) => /Ajoutez-les/i.test(s.text));
        assert.ok(farine && beurre && step);
        return {
          mentions: [
            {
              stepId: step!.id,
              ingredientIds: [farine!.id, beurre!.id]
            }
          ]
        };
      }
    });
    assert.equal(extractCalls, 1);
    const step2 = draft.steps.find((s) => /Ajoutez-les/i.test(s.text));
    const farine = draft.ingredients.find((i) => /farine/i.test(i.label));
    const beurre = draft.ingredients.find((i) => /beurre/i.test(i.label));
    assert.ok(step2?.ingredientIds?.includes(farine!.id));
    assert.ok(step2?.ingredientIds?.includes(beurre!.id));
  } finally {
    globalThis.fetch = originalFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});
