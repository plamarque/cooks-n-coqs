import assert from "node:assert/strict";
import test from "node:test";
import type { Server } from "node:http";
import { app, assistantDependencies } from "../src/server.js";
import { buildCachedImageUrl } from "../src/image-cache.js";
import { CHEF_CATALOG_REVISION } from "@cookies-et-coquilettes/domain/chef-catalog";

const original = { ...assistantDependencies };
const candidate = { candidateRef: "candidate-1", title: "Tarte", ingredientLabels: ["pomme"], durationMin: 30 };

async function withServer(run: (base: string) => Promise<void>): Promise<void> {
  const server = await new Promise<Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}
async function post(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
const agentWire = (overrides: Record<string, unknown> = {}) => ({ catalogRevision: CHEF_CATALOG_REVISION, nonce: "nonce_temporaire_1234", step: 0, activeSkills: ["chef-core"], projection: { message: "sans crème" }, ...overrides });
test.afterEach(() => Object.assign(assistantDependencies, original));

test("agent BFF : accepte seulement le wire V2 fermé, sans état", async () => {
  let received: unknown;
  assistantDependencies.chefAgentV2 = async (input) => { received = input; return { kind: "final", output: "advice", text: "Réduisez la crème." }; };
  await withServer(async (base) => {
    const wire = agentWire({ projection: { message: "sans crème", context: { objective: "des cèpes", constraints: ["sans crème"], clarification: "Quel appareil ?", reference: { title: "Soupe de cèpes" } } } });
    const response = await post(base, "/api/assistant/agent", wire);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { kind: "final", output: "advice", text: "Réduisez la crème." });
    assert.deepEqual(received, wire);
    assert.equal((await post(base, "/api/assistant/agent", agentWire({ projection: { message: "sans crème", context: { objective: "x", recipeId: "local" } } }))).status, 400);
    const invalid = await post(base, "/api/assistant/agent", { message: "x", skills: ["réseau"], tools: [] });
    assert.equal(invalid.status, 400);
  });
});

test("agent BFF V2 : un catalogue divergent ne contacte pas le modèle ni ne persiste", async () => {
  let calls = 0;
  assistantDependencies.chefAgentV2 = async () => { calls += 1; return { kind: "final", output: "advice" }; };
  await withServer(async (base) => {
    const mismatch = await post(base, "/api/assistant/agent", agentWire({ catalogRevision: "ancienne-revision" }));
    assert.equal(mismatch.status, 409);
    assert.deepEqual(await mismatch.json(), { error: "catalog_mismatch" });
    assert.equal(calls, 0);
    const valid = await post(base, "/api/assistant/agent", agentWire());
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { kind: "final", output: "advice" });
    assert.equal(calls, 1);
  });
});

test("agent BFF V2 : valide les résultats entrants et les inputs proposés aux frontières", async () => {
  let calls = 0;
  assistantDependencies.chefAgentV2 = async () => { calls += 1; return { kind: "final", output: "advice" }; };
  await withServer(async (base) => {
    const invalidResult = await post(base, "/api/assistant/agent", agentWire({ results: [{ tool: "search-notebook", result: { titles: ["Soupe"], extra: "interdit" } }] }));
    assert.equal(invalidResult.status, 400);
    assert.equal((await post(base, "/api/assistant/agent", agentWire({ results: [{ tool: "get-recipe-context", result: {} }] }))).status, 400);
    assert.equal(calls, 0);
    assistantDependencies.chefAgentV2 = async () => ({ kind: "tool", tool: "search-notebook", input: { query: "soupe", extra: "interdit" } });
    const invalidDecision = await post(base, "/api/assistant/agent", agentWire());
    assert.equal(invalidDecision.status, 503);
    assistantDependencies.chefAgentV2 = async () => ({ kind: "final", output: "advice", text: "recipeId: dexie-local" });
    assert.equal((await post(base, "/api/assistant/agent", agentWire())).status, 503);
  });
});

test("agent BFF V2 : l'abandon client annule le raisonneur et n'émet aucune finale tardive", async () => {
  let receivedSignal: AbortSignal | undefined;
  let release!: () => void;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  const decisionPromise = new Promise<void>((resolve) => { release = resolve; });
  assistantDependencies.chefAgentV2 = async (_input, signal) => {
    receivedSignal = signal;
    started();
    await decisionPromise;
    return { kind: "final", output: "advice", text: "Réponse trop tardive." };
  };
  await withServer(async (base) => {
    const controller = new AbortController();
    const request = fetch(`${base}/api/assistant/agent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(agentWire()),
      signal: controller.signal
    });
    await startedPromise;
    controller.abort();
    await assert.rejects(request, { name: "AbortError" });
    // La fermeture socket arrive après le rejet local de fetch : laisser le
    // serveur observer l'événement `aborted` avant de vérifier son signal.
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(receivedSignal?.aborted, true);
    release();
  });
});

test("BFF : le proxy TLS local transmet HTTPS à la requête qui construit les URLs générées", async () => {
  app.get("/__test/forwarded-image-url", (req, res) => {
    res.json({ protocol: req.protocol, imageUrl: buildCachedImageUrl(req, "test-key") });
  });
  await withServer(async (base) => {
    const response = await fetch(`${base}/__test/forwarded-image-url`, {
      headers: { Host: "patrices-macbook-pro.tail3f7249.ts.net", "X-Forwarded-Proto": "https" }
    });
    const payload = await response.json() as { protocol: string; imageUrl: string };
    assert.equal(payload.protocol, "https");
    assert.match(payload.imageUrl, /^https:\/\/.+\/api\/generated-images\/test-key$/);
  });
});

test("assistant select HTTP: entrée invalide, candidats, absence et indisponible", async () => {
  await withServer(async (base) => {
    assert.equal((await post(base, "/api/assistant/select", {})).status, 400);
    assistantDependencies.choose = async () => ({ kind: "candidates", candidateRefs: ["candidate-1"], provider: "jev" });
    assert.deepEqual(await (await post(base, "/api/assistant/select", { request: "dessert", candidates: [candidate] })).json(), { kind: "candidates", candidates: [{ candidateRef: "candidate-1", reasonCode: "RELEVANT" }] });
    assistantDependencies.choose = async () => ({ kind: "noCandidate", provider: "jev" });
    assert.deepEqual(await (await post(base, "/api/assistant/select", { request: "inédit", candidates: [candidate] })).json(), { kind: "noCandidate" });
    assistantDependencies.choose = async () => null;
    const unavailable = await post(base, "/api/assistant/select", { request: "x", candidates: [] });
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { kind: "selectionUnavailable" });
  });
});

test("assistant HTTP: sélection admet les cinq résumés bornés, génération garde sa limite 12000", async () => {
  await withServer(async (base) => {
    assistantDependencies.choose = async () => ({ kind: "noCandidate", provider: "jev" });
    assert.equal((await post(base, "/api/assistant/select", { request: "x".repeat(2_600), candidates: [] })).status, 200);
    assert.equal((await post(base, "/api/assistant/select", { request: "x".repeat(2_601), candidates: [] })).status, 400);
    assistantDependencies.generate = async () => ({ title: "Soupe", category: "SALE", ingredients: [{ id: "i", label: "eau", isScalable: false }], steps: [{ id: "s", order: 1, text: "Chauffer" }] });
    assert.equal((await post(base, "/api/assistant/recipe", { request: "x".repeat(12_000) })).status, 200);
  });
});

test("assistant select HTTP: le wire ferme les tours conversationnels", async () => {
  await withServer(async (base) => {
    const response = await post(base, "/api/assistant/select", { request: "soupe", candidates: [], turns: [] });
    assert.equal(response.status, 400);
  });
});

test("assistant recipe HTTP: invalide, trop grand, sans recette et succès", async () => {
  await withServer(async (base) => {
    assert.equal((await post(base, "/api/assistant/recipe", {})).status, 400);
    assert.equal((await post(base, "/api/assistant/recipe", { request: "x".repeat(12001) })).status, 413);
    assistantDependencies.generate = async () => null;
    assert.deepEqual(await (await post(base, "/api/assistant/recipe", { request: "dessert" })).json(), { error: "UPSTREAM_UNAVAILABLE" });
    assistantDependencies.generate = async () => ({ title: "Crumble", category: "SUCRE", ingredients: [{ id: "i", label: "pomme", isScalable: true }], steps: [{ id: "s", order: 1, text: "Cuire" }] });
    assert.equal((await (await post(base, "/api/assistant/recipe", { request: "dessert" })).json() as { title: string }).title, "Crumble");
  });
});

test("assistant advice HTTP: wire fermé, route isolée et indisponibilité", async () => {
  await withServer(async (base) => {
    assert.equal((await post(base, "/api/assistant/advice", { request: "x", history: [] })).status, 400);
    let received: unknown;
    assistantDependencies.advice = async (input) => { received = input; return { kind: "advice", recommendation: "Mijote l'échine avec les cèpes au Cookeo.", reason: "Le fil confirme déjà la viande, les champignons et l'appareil.", confidence: ["certain"] }; };
    const context = { turns: [{ role: "user", text: "porc" }, { role: "assistant", text: "Avec des cèpes ?" }, { role: "user", text: "échine et cèpes", cards: [{ title: "Échine aux cèpes", ingredients: ["porc", "cèpes"], steps: ["Mijoter"] }] }, { role: "user", text: "au Cookeo" }] };
    assert.deepEqual(await (await post(base, "/api/assistant/advice", { request: "au Cookeo", context })).json(), { kind: "advice", recommendation: "Mijote l'échine avec les cèpes au Cookeo.", reason: "Le fil confirme déjà la viande, les champignons et l'appareil.", confidence: ["certain"] });
    assert.deepEqual(received, { request: "au Cookeo", context });
    assistantDependencies.advice = async () => ({ kind: "ideas", ideas: [{ title: "Tarte fine", description: "Pommes et cannelle." }] });
    assert.deepEqual(await (await post(base, "/api/assistant/advice", { request: "Une idée avec des pommes" })).json(), { kind: "ideas", ideas: [{ title: "Tarte fine", description: "Pommes et cannelle." }] });
    assistantDependencies.advice = async () => ({ kind: "ideas", ideas: [{ title: "Réponse invalide" }] } as never);
    const invalidIdeas = await post(base, "/api/assistant/advice", { request: "Une idée" });
    assert.equal(invalidIdeas.status, 503);
    assert.deepEqual(await invalidIdeas.json(), { error: "UPSTREAM_UNAVAILABLE" });
    assert.equal((await post(base, "/api/assistant/advice", { request: "x", context: { turns: [{ role: "user", text: "x", id: "local" }] } })).status, 400);
    assistantDependencies.advice = async () => null;
    assert.equal((await post(base, "/api/assistant/advice", { request: "Ma sauce bout" })).status, 503);
  });
});

test("assistant classification HTTP: contrat fermé, injection et indisponibilité", async () => {
  await withServer(async (base) => {
    assert.equal((await post(base, "/api/assistant/classify-turn", { message: "x", context: { recipeId: "local" } })).status, 400);
    let received: unknown;
    assistantDependencies.classifyTurn = async (input) => { received = input; return { intent: "adapt", confidence: "high", constraints: ["au Cookeo", "sans crème"] }; };
    const input = { message: "au Cookeo et sans crème", context: { objective: "des cèpes", clarification: "Quel appareil ?", constraints: ["sans crème"], reference: { title: "Échine aux cèpes" } } };
    assert.deepEqual(await (await post(base, "/api/assistant/classify-turn", input)).json(), { intent: "adapt", confidence: "high", constraints: ["au Cookeo", "sans crème"] });
    assert.deepEqual(received, input);
    assistantDependencies.classifyTurn = async () => null;
    assert.equal((await post(base, "/api/assistant/classify-turn", { message: "des cèpes" })).status, 503);
  });
});

test("assistant image intents HTTP: plusieurs images temporaires, bornées et image-only", async () => {
  await withServer(async (base) => {
    let simultaneous = 0;
    let maximumSimultaneous = 0;
    assistantDependencies.summarizeImage = async (_buffer, _mime, context) => {
      simultaneous += 1;
      maximumSimultaneous = Math.max(maximumSimultaneous, simultaneous);
      await new Promise((resolve) => setTimeout(resolve, 5));
      simultaneous -= 1;
      return `Résumé ${context}`;
    };
    const form = new FormData();
    form.append("files", new Blob(["a"], { type: "image/png" }), "a.png");
    form.append("files", new Blob(["b"], { type: "image/jpeg" }), "b.jpg");
    form.append("contextText", "dessert");
    const attemptId = "12345678-1234-4234-8234-123456789abc";
    const response = await fetch(`${base}/api/assistant/image-intents?attempt=${attemptId}`, { method: "POST", body: form });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), attemptId);
    assert.deepEqual(await response.json(), { summaries: ["Résumé dessert", "Résumé dessert"] });
    assert.equal(maximumSimultaneous, 1);
    const singleForm = new FormData();
    singleForm.append("file", new Blob(["c"], { type: "image/png" }), "c.png");
    singleForm.append("contextText", "goûter");
    const single = await fetch(`${base}/api/assistant/image-intent`, { method: "POST", body: singleForm });
    assert.equal(single.status, 200);
    assert.deepEqual(await single.json(), { summaries: ["Résumé goûter"] });
    assistantDependencies.summarizeImage = async () => null;
    const unavailableForm = new FormData(); unavailableForm.append("files", new Blob(["a"], { type: "image/png" }), "a.png");
    const unavailable = await fetch(`${base}/api/assistant/image-intents`, { method: "POST", body: unavailableForm });
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { error: "UPSTREAM_UNAVAILABLE" });
    const invalid = new FormData(); invalid.append("files", new Blob(["x"], { type: "text/plain" }), "x.txt");
    assert.equal((await fetch(`${base}/api/assistant/image-intents`, { method: "POST", body: invalid })).status, 400);
    const tooMany = new FormData();
    for (let index = 0; index < 6; index += 1) tooMany.append("files", new Blob(["x"], { type: "image/png" }), `${index}.png`);
    assert.equal((await fetch(`${base}/api/assistant/image-intents`, { method: "POST", body: tooMany })).status, 400);
    const tooLarge = new FormData(); tooLarge.append("files", new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "image/png" }), "large.png");
    assert.equal((await fetch(`${base}/api/assistant/image-intents`, { method: "POST", body: tooLarge })).status, 413);
  });
});
