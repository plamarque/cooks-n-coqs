import assert from "node:assert/strict";
import test from "node:test";
import { chooseNotebookRecipe, isAssistantSelectionInput, normalizeAssistantImageSummary, retryAssistantImageSummary, validateAssistantRecipeDraft } from "../src/assistant-client.js";

test("vision : un résumé trop long reste utilisable pour la décision", () => {
  const summary = normalizeAssistantImageSummary(`Une salade avec des mangues, du riz et de la coriandre. ${"Préparation détaillée. ".repeat(30)}`);
  assert.ok(summary);
  assert.ok(summary.length <= 240);
  assert.match(summary, /mangues/);
  assert.equal(normalizeAssistantImageSummary(" \n "), null);
});

test("vision : une seule image défaillante est reprise individuellement", async () => {
  let calls = 0;
  const summary = await retryAssistantImageSummary(async () => {
    calls += 1;
    return calls === 1 ? null : "Une tarte aux pommes.";
  });
  assert.equal(summary, "Une tarte aux pommes.");
  assert.equal(calls, 2);
});

test("vision : deux échecs bornent la reprise d'une image", async () => {
  let calls = 0;
  const summary = await retryAssistantImageSummary(async () => {
    calls += 1;
    return null;
  });
  assert.equal(summary, null);
  assert.equal(calls, 2);
});

test("vision : l'annulation pendant l'attente empêche toute reprise", async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = retryAssistantImageSummary(async () => {
    calls += 1;
    controller.abort();
    return null;
  }, controller.signal);
  await assert.rejects(pending);
  assert.equal(calls, 1);
});

test("Jev TypeSafe : Choice bornée IMPORT/candidate/NOUVELLE_RECETTE", async () => {
  const key = process.env.TYPESAFE_API_KEY, fetch = globalThis.fetch;
  let payload: Record<string, unknown> | undefined;
  process.env.TYPESAFE_API_KEY = "test";
  globalThis.fetch = async (_url, init) => { payload = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ answers: { route: { type: "choice", choice: "candidate-1", probabilities: { "candidate-1": 0.8 } } } }), { status: 200 }); };
  try {
    assert.deepEqual(await chooseNotebookRecipe({ request: "dessert", candidates: [{ candidateRef: "candidate-1", title: "Tarte", ingredientLabels: [] }] }), { kind: "candidate", candidateRef: "candidate-1" });
    assert.ok((payload?.questions as { route: { criteria: Record<string, string> } }).route.criteria.IMPORT);
    assert.ok((payload?.questions as { route: { criteria: Record<string, string> } }).route.criteria.NOUVELLE_RECETTE);
  } finally { globalThis.fetch = fetch; if (key === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = key; }
});

test("Jev : NOUVELLE_RECETTE est une décision valide, sans secours Luna", async () => {
  const typesafeKey = process.env.TYPESAFE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  process.env.TYPESAFE_API_KEY = "test";
  process.env.OPENAI_API_KEY = "openai-test";
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return new Response(JSON.stringify({
      answers: { route: { type: "choice", choice: "NOUVELLE_RECETTE", probabilities: { NOUVELLE_RECETTE: 0.91 } } }
    }), { status: 200 });
  };
  try {
    assert.deepEqual(await chooseNotebookRecipe({
      request: "un dessert inédit",
      candidates: [{ candidateRef: "candidate-1", title: "Tarte connue", ingredientLabels: [] }]
    }), { kind: "newRecipe" });
    assert.deepEqual(requestedUrls, ["https://api.typesafe.ai/v1/systemone"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (typesafeKey === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = typesafeKey;
    if (openaiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = openaiKey;
  }
});

test("Jev : CLARIFY est proposé seulement avant deux précisions", async () => {
  const key = process.env.TYPESAFE_API_KEY, originalFetch = globalThis.fetch;
  process.env.TYPESAFE_API_KEY = "test";
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: { route: { type: "choice", choice: "CLARIFY", probabilities: { CLARIFY: .9 } } } }), { status: 200 });
  try {
    assert.deepEqual(await chooseNotebookRecipe({ request: "un dîner", candidates: [], clarificationCount: 0 }), { kind: "clarify", question: "" });
    assert.deepEqual(await chooseNotebookRecipe({ request: "un dîner", candidates: [], clarificationCount: 2 }), { kind: "newRecipe" });
  } finally { globalThis.fetch = originalFetch; if (key === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = key; }
});

test("Jev : un candidat sous le seuil devient une nouvelle recette, sans secours Luna", async () => {
  const key = process.env.TYPESAFE_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.TYPESAFE_API_KEY = "test";
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: { route: { type: "choice", choice: "candidate-1", probabilities: { "candidate-1": 0.49 } } } }), { status: 200 });
  try {
    assert.deepEqual(await chooseNotebookRecipe({ request: "un dîner", candidates: [{ candidateRef: "candidate-1", title: "Tarte", ingredientLabels: [] }] }), { kind: "newRecipe" });
  } finally { globalThis.fetch = originalFetch; if (key === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = key; }
});

test("sélection BFF : rejette des candidats arbitraires", () => {
  assert.equal(isAssistantSelectionInput({ request: "x", candidates: [{ candidateRef: "evil", title: "x", ingredientLabels: [] }] }), false);
  assert.equal(isAssistantSelectionInput({ request: "x", candidates: [{ candidateRef: "candidate-1", title: "x", ingredientLabels: [] }, { candidateRef: "candidate-1", title: "y", ingredientLabels: [] }] }), false);
});

test("draft Assistant : rejette vide ou malformé et nettoie les identifiants", () => {
  assert.equal(validateAssistantRecipeDraft({ title: "", category: "SUCRE", ingredients: [], steps: [] }), null);
  assert.equal(validateAssistantRecipeDraft({ title: "X", category: "AUTRE", ingredients: [{ label: "x" }], steps: [{ text: "x" }] }), null);
  assert.equal(validateAssistantRecipeDraft({ title: "X", category: "SALE", ingredients: [{ label: "" }], steps: [{ text: "ok" }] }), null);
  assert.deepEqual(validateAssistantRecipeDraft({ title: "  X ", category: "SALE", prepTimeMin: 9999, ingredients: [{ id: "unsafe", label: " carotte " }], steps: [{ id: "unsafe", text: " cuire " }] }), { title: "X", category: "SALE", ingredients: [{ id: "ingredient-1", label: "carotte", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "cuire" }], prepTimeMin: undefined, cookTimeMin: undefined, restTimeMin: undefined });
});

test("draft Assistant : accepte la forme française enveloppée par le modèle", () => {
  assert.deepEqual(validateAssistantRecipeDraft({ recette: { title: "Roulé", category: "SUCRE", ingredients: [{ label: "Nutella", isScalable: true }], steps: [{ text: "Rouler." }] } }), {
    title: "Roulé", category: "SUCRE", ingredients: [{ id: "ingredient-1", label: "Nutella", isScalable: true }], steps: [{ id: "step-1", order: 1, text: "Rouler." }], prepTimeMin: undefined, cookTimeMin: undefined, restTimeMin: undefined
  });
});
