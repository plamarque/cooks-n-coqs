import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FLARE_MODEL, FLUX_SCHNELL_MODEL, MINI_MODEL, assertBenchmarkOutputOutsideCache, buildBenchmarkRequest, corpusSha256, createReplicateApi, estimateStandardCost, imageResult, renderReviewPage, replicateImageResult, requireBenchmarkApiKey, requireReplicateApiToken, runImageBenchmark, validateCorpus, validateDecisionModels, validateManifest, validateModels } from "../src/image-benchmark.js";

const corpus = validateCorpus({ version: 1, cases: [
  { id:"r1",useCase:"recipe",input:{title:"Tarte",ingredients:[{label:"tomate"}],steps:[{text:"Cuire"}]} }, { id:"r2",useCase:"recipe",input:{title:"Curry",ingredients:[{label:"pois chiche"}],steps:[{text:"Mijoter"}]} }, { id:"r3",useCase:"recipe",input:{title:"Crumble",ingredients:[{label:"pomme"}],steps:[{text:"Dorer"}]} },
  { id:"i1",useCase:"ingredient",input:{label:"tomate"} }, { id:"i2",useCase:"ingredient",input:{label:"citron"} }, { id:"i3",useCase:"ingredient",input:{label:"basilic"} },
  { id:"s1",useCase:"cooking_step",input:{stepText:"Saisir."} }, { id:"s2",useCase:"cooking_step",input:{stepText:"Fouetter."} }, { id:"s3",useCase:"cooking_step",input:{stepText:"Râper."} }
] });

test("valide strictement le corpus, les modèles et l'absence de clé", () => {
  assert.equal(corpus.cases.length, 9);
  assert.throws(() => validateCorpus({ version:1, cases: corpus.cases.slice(0, 8) }));
  assert.deepEqual(validateModels(["current", "candidate"], "current"), ["current", "candidate"]);
  assert.deepEqual(validateDecisionModels([MINI_MODEL, FLARE_MODEL, FLUX_SCHNELL_MODEL]), [MINI_MODEL, FLARE_MODEL, FLUX_SCHNELL_MODEL]);
  assert.throws(() => validateDecisionModels([MINI_MODEL, "other"]));
  assert.throws(() => validateModels(["candidate"], "current"));
  assert.throws(() => requireBenchmarkApiKey(undefined), /aucun artefact/);
  assert.throws(() => requireBenchmarkApiKey("   "), /aucun artefact/); assert.equal(requireBenchmarkApiKey(" key "), "key");
  assert.throws(() => requireReplicateApiToken(undefined), /aucun artefact/);
  assert.throws(() => requireReplicateApiToken("   "), /aucun artefact/); assert.equal(requireReplicateApiToken(" token "), "token");
  assert.throws(() => validateManifest({ version: 1, corpusSha256: "bad", attempts: [] }));
  assert.throws(() => assertBenchmarkOutputOutsideCache(".cache/generated-images/run", ".cache/generated-images"));
  assert.doesNotThrow(() => assertBenchmarkOutputOutsideCache("benchmark-results", ".cache/generated-images"));
  assert.throws(() => validateCorpus({ version:1, cases: corpus.cases.map((item, index) => index === 0 ? { ...item, input: { ...(item.input as object), ingredients: [{}] } } : item) }));
});

test("envoie 30 requêtes, normalise FLUX et produit manifeste identifié et revue", async () => {
  const requests: Record<string, unknown>[] = [];
  const client = { images: { generate: async (request: Record<string, unknown>) => { requests.push(request); return { data:[{ b64_json: Buffer.from("image").toString("base64") }], usage: { input_tokens: 1, cost: 0.04 } }; } } };
  const output = await mkdtemp(path.join(os.tmpdir(), "image-benchmark-")); const hash = corpusSha256("corpus exact");
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8X"), Buffer.alloc(8), Buffer.from([255, 3, 0, 255, 3, 0])]);
  const replicateRequests: Record<string, unknown>[] = [];
  const manifest = await runImageBenchmark(corpus, hash, [MINI_MODEL, FLARE_MODEL, FLUX_SCHNELL_MODEL], output, { openai: client, replicate: { run: async (request) => { replicateRequests.push(request); return { output: ["https://output.replicate.delivery/image.webp"] }; } }, fetchFn: async () => new Response(webp, { headers: { "content-type": "image/webp" } }) });
  assert.equal(requests.length, 21); assert.equal(manifest.corpusSha256, hash); assert.equal(manifest.attempts.filter((x) => x.status === "success").length, 30);
  assert.equal(manifest.attempts.filter((x) => x.profile === "ingredient-816").length, 3); assert.equal(manifest.attempts.find((x) => x.profile === "ingredient-816")?.dimensions, "816x816");
  assert.equal(manifest.attempts[0].request?.model, MINI_MODEL); assert.deepEqual(manifest.attempts[0].apiUsage, null); assert.equal(manifest.attempts[0].estimatedStandardCostUsd, null); assert.equal(estimateStandardCost(MINI_MODEL, { inputTokens: 1, outputTokens: 2, totalTokens: 3 }), 0.000018); assert.equal(estimateStandardCost(FLARE_MODEL, { inputTokens: 1, outputTokens: 2, totalTokens: 3 }), 0.000065);
  const flux = manifest.attempts.find((attempt) => attempt.model === FLUX_SCHNELL_MODEL);
  assert.equal(flux?.apiUsageAvailability, "unavailable"); assert.equal(flux?.estimatedStandardCostUsd, 0.003); assert.equal(flux?.receivedDimensions, "1024x1024");
  assert.equal(replicateRequests.length, 9); assert.deepEqual((replicateRequests[0].input as Record<string, unknown>).megapixels, "1"); assert.equal((replicateRequests[0].input as Record<string, unknown>).go_fast, true);
  assert.match(await readFile(path.join(output, "review.html"), "utf8"), /Icône ingrédient/);
  assert.equal(JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8")).corpusSha256, hash);
});

test("le chemin URL impose une image non vide typée et conserve son extension", async () => {
  const fetchMock = async () => new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/webp; charset=utf-8" } });
  assert.deepEqual(await imageResult({ data: [{ url: "https://example.test/image" }] }, fetchMock as typeof fetch), { bytes: Buffer.from([1, 2]), format: "webp" });
  await assert.rejects(() => imageResult({ data: [{ url: "https://example.test/not-image" }] }, (async () => new Response("x", { headers: { "content-type": "text/html" } })) as typeof fetch));
  await assert.rejects(() => imageResult({ data: [{ url: "https://example.test/empty" }] }, (async () => new Response(new Uint8Array(), { headers: { "content-type": "image/png" } })) as typeof fetch));
});

test("FLUX rejette un fichier non-image et laisse les autres tentatives continuer", async () => {
  await assert.rejects(() => replicateImageResult({ output: ["http://output.replicate.delivery/image.webp"] }));
  await assert.rejects(() => replicateImageResult({ output: ["https://example.test/image.webp"] }));
  await assert.rejects(() => replicateImageResult({ output: ["https://output.replicate.delivery/not-image"] }, (async () => new Response("not image", { headers: { "content-type": "image/webp" } })) as typeof fetch));
  const client = { images: { generate: async () => ({ data:[{ b64_json: Buffer.from("image").toString("base64") }] }) } };
  const manifest = await runImageBenchmark(corpus, corpusSha256("flux-fail"), [MINI_MODEL, FLARE_MODEL, FLUX_SCHNELL_MODEL], await mkdtemp(path.join(os.tmpdir(), "image-benchmark-")), { openai: client, replicate: { run: async () => ({ output: ["https://output.replicate.delivery/not-image"] }) }, fetchFn: async () => new Response("not image", { headers: { "content-type": "image/webp" } }) });
  assert.equal(manifest.attempts.length, 30); assert.equal(manifest.attempts.filter((attempt) => attempt.model === FLUX_SCHNELL_MODEL && attempt.status === "failed").length, 9); assert.equal(manifest.attempts.filter((attempt) => attempt.model !== FLUX_SCHNELL_MODEL && attempt.status === "success").length, 21);
});

test("l'adaptateur Replicate enveloppe input et attend la prédiction terminée", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) return new Response(JSON.stringify({ status: "starting", urls: { get: "https://api.replicate.test/predictions/123" } }), { headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ status: "succeeded", output: ["https://delivery.replicate.test/image.webp"] }), { headers: { "content-type": "application/json" } });
  };
  const result = await createReplicateApi("r8_example-token", fetchMock as typeof fetch).run({ input: { prompt: "une tarte", aspect_ratio: "1:1", megapixels: "1", go_fast: true, output_format: "webp", num_inference_steps: 4 } });
  assert.deepEqual(result, { status: "succeeded", output: ["https://delivery.replicate.test/image.webp"] });
  assert.equal(calls.length, 2); assert.equal(calls[0].url, `https://api.replicate.com/v1/models/${FLUX_SCHNELL_MODEL}/predictions`);
  assert.equal(calls[0].init?.method, "POST"); assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer r8_example-token"); assert.equal((calls[0].init?.headers as Record<string, string>).Prefer, "wait=60");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { input: { prompt: "une tarte", aspect_ratio: "1:1", megapixels: "1", go_fast: true, output_format: "webp", num_inference_steps: 4 } });
  assert.equal(calls[1].url, "https://api.replicate.test/predictions/123"); assert.equal((calls[1].init?.headers as Record<string, string>).Authorization, "Bearer r8_example-token");
});

test("le profil expérimental est réservé à Flare et la revue échappe les valeurs", () => {
  assert.throws(() => buildBenchmarkRequest(corpus.cases[3], MINI_MODEL, "ingredient-816"));
  const html = renderReviewPage({ version:2, corpusSha256:corpusSha256("x"), startedAt:"", finishedAt:"", pricing: { source:"", verifiedAt:"", currency:"USD", formula:"", billingNotice:"standard-estimate-not-invoice", ratesPerMillionTokens:{ [MINI_MODEL]: { input:2, output:8 }, [FLARE_MODEL]: { input:5, output:30 } }, providerUnitCostsUsd:{ [FLUX_SCHNELL_MODEL]: 0.003 } }, aggregates:[], humanEvaluation:{}, attempts:[{ caseId:"<case>",useCase:"ingredient",model:"<model>",profile:"production",prompt:null,request:null,quality:null,dimensions:null,receivedDimensions:null,outputFormat:null,status:"failed",latencyMs:0,apiUsage:null,apiUsageAvailability:"unavailable",costMethod:"openai-token-estimate",estimatedStandardCostUsd:null,error:"<error>",imageFile:null,humanEvaluation:{} }] });
  assert.match(html, /&lt;case&gt;/); assert.doesNotMatch(html, /<case>/); assert.match(html, /Icône ingrédient/);
});

test("continue après un échec fournisseur et une erreur de préparation", async () => {
  let calls = 0; const client = { images: { generate: async () => { calls += 1; if (calls === 2) throw new Error("provider failure"); return { data:[{ b64_json: Buffer.from("image").toString("base64") }] }; } } };
  const malformed = { ...corpus, cases: [...corpus.cases, { id:"broken",useCase:"ingredient" as const,input:{label:""} }] };
  const manifest = await runImageBenchmark(corpus, corpusSha256("corpus"), [MINI_MODEL, FLARE_MODEL, FLUX_SCHNELL_MODEL], await mkdtemp(path.join(os.tmpdir(), "image-benchmark-")), { openai: client, replicate: { run: async () => ({ output: ["https://output.replicate.delivery/image.webp"] }) }, fetchFn: async () => new Response(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8X"), Buffer.alloc(8), Buffer.from([255, 3, 0, 255, 3, 0])]), { headers: { "content-type": "image/webp" } }) });
  assert.equal(manifest.attempts.length, 30); assert.equal(manifest.attempts[1].status, "failed"); assert.match(manifest.attempts[1].error ?? "", /provider failure/);
});

test("le rapport versionné couvre la grille, les indisponibilités et attend l'opérateur", async () => {
  const report = await readFile(fileURLToPath(new URL("../../../docs/IMAGE_MODEL_VALIDATION.md", import.meta.url)), "utf8");

  assert.match(report, /## Identité obligatoire de l'exécution/);
  assert.match(report, /`manifest\.json`/); assert.match(report, /`review\.html`/);
  assert.match(report, /## Consolidation des mesures API relevées/);
  assert.match(report, /30 tentatives/); assert.match(report, /FLUX Schnell/); assert.match(report, /REPLICATE_API_TOKEN/); assert.match(report, /0\.003/); assert.match(report, /ingredient-816/); assert.match(report, /non facturée/);
  assert.match(report, /aucune décision par usage ne peut être\s+validée tant que cette absence n'est pas documentée et résolue/);
  assert.match(report, /## Grille d'appréciation humaine par cas/);
  assert.match(report, /une ligne par tentative/);
  for (const caseId of ["tarte-tomates", "curry-pois-chiches", "crumble-pommes", "pois-chiche", "basilic", "citron", "saisir-saumon", "fouetter-creme", "raper-legumes"]) assert.match(report, new RegExp("`" + caseId + "`"));

  assert.match(report, /apiUsageAvailability/); assert.match(report, /`unavailable`/);
  assert.match(report, /jamais zéro/); assert.match(report, /`failed`/); assert.match(report, /`error`/);

  assert.match(report, /## Décision par usage/);
  for (const useCase of ["recipe", "ingredient", "cooking_step"]) assert.match(report, new RegExp("\\| `" + useCase + "` \\|[^\\n]*\\| `awaiting-operator` \\|"));
  assert.match(report, /\*\*Décision finale :\*\* `awaiting-operator`/);
  assert.match(report, /Aucune configuration de production n'a été modifiée/);
});
