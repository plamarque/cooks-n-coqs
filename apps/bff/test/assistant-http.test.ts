import assert from "node:assert/strict";
import test from "node:test";
import type { Server } from "node:http";
import { app, assistantDependencies } from "../src/server.js";
import { buildCachedImageUrl } from "../src/image-cache.js";

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
test.afterEach(() => Object.assign(assistantDependencies, original));

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

test("assistant select HTTP: entrée invalide, candidat, import, nouveau et indisponible", async () => {
  await withServer(async (base) => {
    assert.equal((await post(base, "/api/assistant/select", {})).status, 400);
    assistantDependencies.choose = async () => ({ kind: "candidate", candidateRef: "candidate-1" });
    assert.deepEqual(await (await post(base, "/api/assistant/select", { request: "dessert", candidates: [candidate] })).json(), { kind: "candidate", candidateRef: "candidate-1", reasonCode: "RELEVANT" });
    assistantDependencies.choose = async () => ({ kind: "import" });
    assert.deepEqual(await (await post(base, "/api/assistant/select", { request: "recette: ...", candidates: [candidate] })).json(), { kind: "import" });
    assistantDependencies.choose = async () => ({ kind: "newRecipe" });
    assert.deepEqual(await (await post(base, "/api/assistant/select", { request: "inédit", candidates: [candidate] })).json(), { kind: "newRecipe" });
    assistantDependencies.choose = async () => null;
    const unavailable = await post(base, "/api/assistant/select", { request: "x", candidates: [] });
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { kind: "selectionUnavailable" });
  });
});

test("assistant HTTP: sélection admet les cinq résumés bornés, génération garde sa limite 12000", async () => {
  await withServer(async (base) => {
    assistantDependencies.choose = async () => ({ kind: "newRecipe" });
    assert.equal((await post(base, "/api/assistant/select", { request: "x".repeat(2_600), candidates: [] })).status, 200);
    assert.equal((await post(base, "/api/assistant/select", { request: "x".repeat(2_601), candidates: [] })).status, 400);
    assistantDependencies.generate = async () => ({ title: "Soupe", category: "SALE", ingredients: [{ id: "i", label: "eau", isScalable: false }], steps: [{ id: "s", order: 1, text: "Chauffer" }] });
    assert.equal((await post(base, "/api/assistant/recipe", { request: "x".repeat(12_000) })).status, 200);
  });
});

test("assistant select HTTP: clarify, plafond dérivé du fil et échec rédacteur", async () => {
  await withServer(async (base) => {
    assistantDependencies.choose = async () => ({ kind: "clarify", question: "" });
    assistantDependencies.clarify = async () => "Pour combien de personnes ?";
    const first = await post(base, "/api/assistant/select", { request: "soupe", candidates: [], turns: [{ role: "user", text: "soupe" }] });
    assert.deepEqual(await first.json(), { kind: "clarify", question: "Pour combien de personnes ?" });
    const ceiling = await post(base, "/api/assistant/select", { request: "soupe", candidates: [], turns: [{ role: "assistant", text: "q1" }, { role: "assistant", text: "q2" }] });
    assert.deepEqual(await ceiling.json(), { kind: "newRecipe" });
    assistantDependencies.clarify = async () => { throw new Error("down"); };
    const unavailable = await post(base, "/api/assistant/select", { request: "soupe", candidates: [], turns: [] });
    assert.equal(unavailable.status, 503);
    assert.ok(unavailable.headers.get("x-request-id"));
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
