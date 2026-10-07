import assert from "node:assert/strict";
import test from "node:test";
import { ASSISTANT_IMAGE_CONTEXT_MAX_LENGTH, ASSISTANT_SELECTION_REQUEST_MAX_LENGTH, AssistantImageRequestError, buildAssistantSelectionRequest, generateAssistantRecipe, requestChefAdvice, resolveAssistantProgressPhotoUrl, selectNotebookRecipe, summarizeAssistantImages, truncateAssistantImageContext } from "../src/services/assistant-service";

test("la vignette de progression suit la photo lue, puis laisse place au logo", () => {
  const previews = ["blob:photo-1", "blob:photo-2"];
  assert.equal(resolveAssistantProgressPhotoUrl("analyzing", { phase: "preparing", current: 1, total: 2 }, previews), "blob:photo-1");
  assert.equal(resolveAssistantProgressPhotoUrl("analyzing", { phase: "reading", current: 2, total: 2 }, previews), "blob:photo-2");
  assert.equal(resolveAssistantProgressPhotoUrl("searching", { phase: "reading", current: 2, total: 2 }, previews), null);
  assert.equal(resolveAssistantProgressPhotoUrl("analyzing", { phase: "reading", current: 3, total: 2 }, previews), null);
});

test("requête Jev : reste bornée et conserve prioritairement tous les résumés visuels", () => {
  const summaries = Array.from({ length: 5 }, (_, index) => `photo-${index}-${"v".repeat(230)}`);
  const request = buildAssistantSelectionRequest("texte ".repeat(1_000), summaries);
  assert.ok(request.length <= ASSISTANT_SELECTION_REQUEST_MAX_LENGTH);
  for (const summary of summaries) assert.match(request, new RegExp(summary));
});

test("contexte vision multipart : reste sous la limite BFF, y compris avec des caractères multioctets", () => {
  const context = truncateAssistantImageContext("🍲".repeat(1_000));
  assert.ok(new TextEncoder().encode(context).length <= ASSISTANT_IMAGE_CONTEXT_MAX_LENGTH);
});

test("Jev envoie uniquement la demande et le snapshot minimisé au BFF", async () => {
  const previous = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (_url, init) => {
    body = String(init?.body);
    return new Response(JSON.stringify({ kind: "noCandidate" }), { status: 200 });
  };
  try {
    const result = await selectNotebookRecipe("dessert fruité", [{ candidateRef: "candidate-1", title: "Tarte", ingredientLabels: ["pomme"], durationMin: 40 }], new AbortController().signal);
    assert.equal(result.kind, "noCandidate");
    assert.match(body, /dessert fruité/);
    assert.doesNotMatch(body, /steps|imageUrl|source/);
  } finally { globalThis.fetch = previous; }
});

test("Jev refuse localement un snapshot hors contrat sans appel réseau", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(); };
  try {
    await assert.rejects(selectNotebookRecipe("dîner", [{ candidateRef: "durable-id", title: "Recette", ingredientLabels: [] }], new AbortController().signal), /selection input invalid/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previous; }
});

test("génération Jev : une recette complète devient un brouillon temporaire", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ title: "Crumble", category: "SUCRE", ingredients: [{ id: "ingredient-1", label: "pomme", isScalable: true }], steps: [{ id: "step-1", order: 1, text: "Cuire." }] }), { status: 200 });
  try {
    const draft = await generateAssistantRecipe("dessert", new AbortController().signal);
    assert.equal(draft.title, "Crumble");
    assert.equal(draft.steps.length, 1);
  } finally { globalThis.fetch = previous; }
});

test("génération Assistant : transmet la demande enrichie et refuse un wire hors contrat", async () => {
  const previous = globalThis.fetch;
  let sent = "";
  globalThis.fetch = async (_url, init) => {
    sent = String(init?.body);
    return new Response(JSON.stringify({ title: "Crumble", category: "SUCRE", ingredients: [{ id: "ingredient-1", label: "pomme", isScalable: true }], steps: [{ id: "step-1", order: 1, text: "Cuire." }], source: { type: "TEXT" } }), { status: 200 });
  };
  try {
    await assert.rejects(generateAssistantRecipe("Dessert\nRésumés visuels temporaires: pommes", new AbortController().signal), /assistant_recipe:invalid/);
    assert.match(sent, /Résumés visuels temporaires/);
  } finally { globalThis.fetch = previous; }
});

test("génération Assistant : une indisponibilité ne produit pas de brouillon", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "UPSTREAM_UNAVAILABLE" }), { status: 503 });
  try {
    await assert.rejects(generateAssistantRecipe("Soupe", new AbortController().signal), /assistant_recipe:unavailable/);
  } finally { globalThis.fetch = previous; }
});

test("conseil Chef : transmet seulement le wire minimal et rejette une réponse inconnue", async () => {
  const previous = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (_url, init) => {
    body = String(init?.body);
    return new Response(JSON.stringify({ kind: "invented" }), { status: 200 });
  };
  try {
    await assert.rejects(requestChefAdvice({ request: "Ma sauce est trop épaisse" }, new AbortController().signal), /assistant_recipe:invalid/);
    assert.match(body, /Ma sauce est trop épaisse/);
    assert.doesNotMatch(body, /history|profile|candidates/);
  } finally { globalThis.fetch = previous; }
});

test("conseil Chef : transporte le fil complet projeté sans identifiant ou blob local", async () => {
  const previous = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (_url, init) => {
    body = String(init?.body);
    return new Response(JSON.stringify({ kind: "advice", recommendation: "Cuire au Cookeo.", reason: "Le fil indique déjà l'échine et les cèpes.", confidence: ["certain"] }), { status: 200 });
  };
  try {
    const context = { turns: [{ role: "user" as const, text: "porc" }, { role: "assistant" as const, text: "Prenons une échine aux cèpes.", cards: [{ title: "Échine aux cèpes", ingredients: ["porc", "cèpes"], steps: ["Mijoter"], thumbnail: "data:image/png;base64,AA==" }] }, { role: "user" as const, text: "au Cookeo" }] };
    const result = await requestChefAdvice({ request: "au Cookeo", context }, new AbortController().signal);
    assert.equal(result.kind, "advice");
    assert.match(body, /Échine aux cèpes/);
    assert.match(body, /data:image\/png/);
    assert.doesNotMatch(body, /blob:|recipeId|profile/);
  } finally { globalThis.fetch = previous; }
});

test("analyse images : chaque binaire part séparément vers l'endpoint vision temporaire", async () => {
  const previous = globalThis.fetch;
  const urls: string[] = [];
  const filenames: string[] = [];
  let contextText = "";
  try {
    globalThis.fetch = async (input, init) => {
      urls.push(String(input));
      const form = init?.body as FormData;
      contextText = String(form.get("contextText"));
      filenames.push((form.get("file") as File).name);
      return new Response(JSON.stringify({ summaries: [filenames.length === 1 ? "Une tarte aux pommes." : "Des poires."] }), { status: 200 });
    };
    assert.deepEqual(await summarizeAssistantImages([new File(["pixels"], "plat.png", { type: "image/png" }), new File(["pixels"], "poires.png", { type: "image/png" })], "x".repeat(ASSISTANT_IMAGE_CONTEXT_MAX_LENGTH + 100), new AbortController().signal), ["Une tarte aux pommes.", "Des poires."]);
    assert.deepEqual(filenames, ["plat.png", "poires.png"]);
    assert.equal(urls.length, 2);
    assert.ok(urls.every((url) => /assistant\/image-intent\?attempt=/.test(url)));
    assert.ok(new TextEncoder().encode(contextText).length <= ASSISTANT_IMAGE_CONTEXT_MAX_LENGTH);
  } finally { globalThis.fetch = previous; }
});

test("analyse images : le statut et la référence d'un 503 sont conservés", async () => {
  const previous = globalThis.fetch;
  let attempt = "";
  globalThis.fetch = async (input) => {
    attempt = new URL(String(input)).searchParams.get("attempt") ?? "";
    return new Response(JSON.stringify({ error: "UPSTREAM_UNAVAILABLE" }), { status: 503 });
  };
  try {
    await assert.rejects(
      summarizeAssistantImages([new File(["pixels"], "plat.png", { type: "image/png" })], "", new AbortController().signal),
      (error: unknown) => error instanceof AssistantImageRequestError && error.status === 503 && error.reference === attempt && /^[0-9a-f-]{36}$/.test(attempt)
    );
  } finally { globalThis.fetch = previous; }
});

test("analyse images : la progression expose lecture n/N sans contenu utilisateur", async () => {
  const previous = globalThis.fetch;
  const progress: Array<{ phase: string; current: number; total: number }> = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ summaries: ["Une soupe."] }), { status: 200 });
  try {
    await summarizeAssistantImages([new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })], "contexte privé", new AbortController().signal, (event) => progress.push(event));
    assert.deepEqual(progress.map(({ phase, current, total }) => ({ phase, current, total })), [
      { phase: "reading", current: 1, total: 2 }, { phase: "reading", current: 1, total: 2 },
      { phase: "reading", current: 2, total: 2 }, { phase: "reading", current: 2, total: 2 }
    ]);
  } finally { globalThis.fetch = previous; }
});
