import assert from "node:assert/strict";
import test from "node:test";
import { chooseNotebookRecipe, decodeChefAdviceWire, getChefAdvice, isAssistantSelectionInput, isRetryableAssistantImageError, normalizeAssistantImageSummary, retryAssistantImageSummary, validateAssistantRecipeDraft } from "../src/assistant-client.js";

test("conseil BFF : décode advice et recipe, et rejette un wire fournisseur invalide", () => {
  assert.deepEqual(decodeChefAdviceWire('{"kind":"recipe"}'), { kind: "recipe" });
  assert.deepEqual(decodeChefAdviceWire('{"kind":"advice","recommendation":"Baisse le feu.","reason":"La sauce restera lisse.","confidence":["certain"]}'), { kind: "advice", recommendation: "Baisse le feu.", reason: "La sauce restera lisse.", confidence: ["certain"] });
  assert.equal(decodeChefAdviceWire('{"kind":"advice","recommendation":"x"}'), null);
  assert.equal(decodeChefAdviceWire('not json'), null);
});

test("conseil BFF : entrée invalide ou signal annulé ne déclenchent aucune reprise", async () => {
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
  assert.equal(await getChefAdvice({ request: "" }, new AbortController().signal), null);
  const controller = new AbortController();
  controller.abort();
  // Sans clé fournisseur, cette garde locale confirme qu’aucun retry n’est introduit.
  assert.equal(await getChefAdvice({ request: "Ma sauce est épaisse" }, controller.signal), null);
  } finally { if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; }
});

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

test("vision : un 4xx définitif ne repart pas, un 429 repart une fois", async () => {
  let definitiveCalls = 0;
  const definitive = await retryAssistantImageSummary(async () => {
    definitiveCalls += 1;
    throw Object.assign(new Error("bad request"), { status: 400 });
  });
  assert.equal(definitive, null);
  assert.equal(definitiveCalls, 1);
  assert.equal(isRetryableAssistantImageError(Object.assign(new Error(), { status: 401 })), false);
  let transientCalls = 0;
  const transient = await retryAssistantImageSummary(async () => {
    transientCalls += 1;
    if (transientCalls === 1) throw Object.assign(new Error("busy"), { status: 429 });
    return "Une soupe.";
  });
  assert.equal(transient, "Une soupe.");
  assert.equal(transientCalls, 2);
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

test("Jev TypeSafe : Choice bornée candidate/noCandidate", async () => {
  const key = process.env.TYPESAFE_API_KEY, fetch = globalThis.fetch;
  let payload: Record<string, unknown> | undefined;
  process.env.TYPESAFE_API_KEY = "test";
  globalThis.fetch = async (_url, init) => { payload = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ answers: { route: { type: "choice", choice: "candidate-1", probabilities: { "candidate-1": 0.8 } } } }), { status: 200 }); };
  try {
    assert.deepEqual(await chooseNotebookRecipe({ request: "dessert", candidates: [{ candidateRef: "candidate-1", title: "Tarte", ingredientLabels: [] }] }), { kind: "candidates", candidateRefs: ["candidate-1"], provider: "jev" });
    assert.ok((payload?.questions as { route: { criteria: Record<string, string> } }).route.criteria.NO_CANDIDATE);
  } finally { globalThis.fetch = fetch; if (key === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = key; }
});

test("Jev : noCandidate valide ne déclenche pas Luna", async () => {
  const typesafeKey = process.env.TYPESAFE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  process.env.TYPESAFE_API_KEY = "test";
  process.env.OPENAI_API_KEY = "openai-test";
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return new Response(JSON.stringify({
      answers: { route: { type: "choice", choice: "NO_CANDIDATE", probabilities: { NO_CANDIDATE: 0.91 } } }
    }), { status: 200 });
  };
  try {
    assert.deepEqual(await chooseNotebookRecipe({
      request: "un dessert inédit",
      candidates: [{ candidateRef: "candidate-1", title: "Tarte connue", ingredientLabels: [] }]
    }), { kind: "noCandidate", provider: "jev" });
    assert.deepEqual(requestedUrls, ["https://api.typesafe.ai/v1/systemone"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (typesafeKey === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = typesafeKey;
    if (openaiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = openaiKey;
  }
});

test("Jev : un 4xx devient indisponible sans secours Luna", async () => {
  const typesafeKey = process.env.TYPESAFE_API_KEY, openaiKey = process.env.OPENAI_API_KEY, originalFetch = globalThis.fetch;
  const urls: string[] = [];
  process.env.TYPESAFE_API_KEY = "test"; process.env.OPENAI_API_KEY = "test";
  globalThis.fetch = async (url) => { urls.push(String(url)); return new Response("bad request", { status: 400 }); };
  try {
    assert.equal(await chooseNotebookRecipe({ request: "dîner", candidates: [] }), null);
    assert.deepEqual(urls, ["https://api.typesafe.ai/v1/systemone"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (typesafeKey === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = typesafeKey;
    if (openaiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = openaiKey;
  }
});

test("Jev : conserve deux puis trois candidates ordonnées et dédupliquées", async () => {
  const key = process.env.TYPESAFE_API_KEY, originalFetch = globalThis.fetch;
  process.env.TYPESAFE_API_KEY = "test";
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: { route: { type: "choice", choices: [
    { choice: "candidate-2", probability: .9 }, { choice: "candidate-1", probability: .8 }, { choice: "candidate-2", probability: .7 }, { choice: "candidate-3", probability: .6 }
  ] } } }), { status: 200 });
  try {
    const candidates = ["1", "2", "3"].map((n) => ({ candidateRef: `candidate-${n}`, title: n, ingredientLabels: [] }));
    assert.deepEqual(await chooseNotebookRecipe({ request: "dîner", candidates }), { kind: "candidates", candidateRefs: ["candidate-2", "candidate-1", "candidate-3"], provider: "jev" });
  } finally { globalThis.fetch = originalFetch; if (key === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = key; }
});

test("Jev : un candidat sous le seuil devient noCandidate, sans secours Luna", async () => {
  const key = process.env.TYPESAFE_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.TYPESAFE_API_KEY = "test";
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: { route: { type: "choice", choice: "candidate-1", probabilities: { "candidate-1": 0.49 } } } }), { status: 200 });
  try {
    assert.deepEqual(await chooseNotebookRecipe({ request: "un dîner", candidates: [{ candidateRef: "candidate-1", title: "Tarte", ingredientLabels: [] }] }), { kind: "noCandidate", provider: "jev" });
  } finally { globalThis.fetch = originalFetch; if (key === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = key; }
});

test("sélection BFF : rejette des candidats arbitraires", () => {
  assert.equal(isAssistantSelectionInput({ request: "x", candidates: [{ candidateRef: "evil", title: "x", ingredientLabels: [] }] }), false);
  assert.equal(isAssistantSelectionInput({ request: "x", candidates: [{ candidateRef: "candidate-1", title: "x", ingredientLabels: [] }, { candidateRef: "candidate-1", title: "y", ingredientLabels: [] }] }), false);
  assert.equal(isAssistantSelectionInput({ request: "x", candidates: [{ candidateRef: "candidate-1", title: "x", ingredientLabels: [], durationMin: -1 }] }), false);
  assert.equal(isAssistantSelectionInput({ request: "x", candidates: [{ candidateRef: "candidate-1", title: "x", ingredientLabels: [], durationMin: 1.5 }] }), false);
  assert.equal(isAssistantSelectionInput({ request: "x".repeat(2_600), candidates: [] }), true);
  assert.equal(isAssistantSelectionInput({ request: "x".repeat(2_601), candidates: [] }), false);
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
