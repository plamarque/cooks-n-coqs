import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { FLARE_MODEL, MINI_MODEL, assertBenchmarkOutputOutsideCache, buildBenchmarkRequest, corpusSha256, estimateStandardCost, imageResult, renderReviewPage, requireBenchmarkApiKey, runImageBenchmark, validateCorpus, validateDecisionModels, validateManifest, validateModels } from "../src/image-benchmark.js";

const corpus = validateCorpus({ version: 1, cases: [
  { id:"r1",useCase:"recipe",input:{title:"Tarte",ingredients:[{label:"tomate"}],steps:[{text:"Cuire"}]} }, { id:"r2",useCase:"recipe",input:{title:"Curry",ingredients:[{label:"pois chiche"}],steps:[{text:"Mijoter"}]} }, { id:"r3",useCase:"recipe",input:{title:"Crumble",ingredients:[{label:"pomme"}],steps:[{text:"Dorer"}]} },
  { id:"i1",useCase:"ingredient",input:{label:"tomate"} }, { id:"i2",useCase:"ingredient",input:{label:"citron"} }, { id:"i3",useCase:"ingredient",input:{label:"basilic"} },
  { id:"s1",useCase:"cooking_step",input:{stepText:"Saisir."} }, { id:"s2",useCase:"cooking_step",input:{stepText:"Fouetter."} }, { id:"s3",useCase:"cooking_step",input:{stepText:"Râper."} }
] });

test("valide strictement le corpus, les modèles et l'absence de clé", () => {
  assert.equal(corpus.cases.length, 9);
  assert.throws(() => validateCorpus({ version:1, cases: corpus.cases.slice(0, 8) }));
  assert.deepEqual(validateModels(["current", "candidate"], "current"), ["current", "candidate"]);
  assert.deepEqual(validateDecisionModels([MINI_MODEL, FLARE_MODEL]), [MINI_MODEL, FLARE_MODEL]);
  assert.throws(() => validateDecisionModels([MINI_MODEL, "other"]));
  assert.throws(() => validateModels(["candidate"], "current"));
  assert.throws(() => requireBenchmarkApiKey(undefined), /aucun artefact/);
  assert.throws(() => validateManifest({ version: 1, corpusSha256: "bad", attempts: [] }));
  assert.throws(() => assertBenchmarkOutputOutsideCache(".cache/generated-images/run", ".cache/generated-images"));
  assert.doesNotThrow(() => assertBenchmarkOutputOutsideCache("benchmark-results", ".cache/generated-images"));
  assert.throws(() => validateCorpus({ version:1, cases: corpus.cases.map((item, index) => index === 0 ? { ...item, input: { ...(item.input as object), ingredients: [{}] } } : item) }));
});

test("envoie une requête pour chaque couple cas-modèle et produit manifeste identifié et revue", async () => {
  const requests: Record<string, unknown>[] = [];
  const client = { images: { generate: async (request: Record<string, unknown>) => { requests.push(request); return { data:[{ b64_json: Buffer.from("image").toString("base64") }], usage: { input_tokens: 1, cost: 0.04 } }; } } };
  const output = await mkdtemp(path.join(os.tmpdir(), "image-benchmark-")); const hash = corpusSha256("corpus exact");
  const manifest = await runImageBenchmark(corpus, hash, [MINI_MODEL, FLARE_MODEL], output, client);
  assert.equal(requests.length, 21); assert.equal(manifest.corpusSha256, hash); assert.equal(manifest.attempts.filter((x) => x.status === "success").length, 21);
  assert.equal(manifest.attempts.filter((x) => x.profile === "ingredient-816").length, 3); assert.equal(manifest.attempts.find((x) => x.profile === "ingredient-816")?.dimensions, "816x816");
  assert.equal(manifest.attempts[0].request?.model, MINI_MODEL); assert.deepEqual(manifest.attempts[0].apiUsage, null); assert.equal(manifest.attempts[0].estimatedStandardCostUsd, null); assert.equal(estimateStandardCost(MINI_MODEL, { inputTokens: 1, outputTokens: 2, totalTokens: 3 }), 0.000018);
  assert.match(await readFile(path.join(output, "review.html"), "utf8"), /Icône ingrédient/);
  assert.equal(JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8")).corpusSha256, hash);
});

test("le chemin URL impose une image non vide typée et conserve son extension", async () => {
  const fetchMock = async () => new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/webp; charset=utf-8" } });
  assert.deepEqual(await imageResult({ data: [{ url: "https://example.test/image" }] }, fetchMock as typeof fetch), { bytes: Buffer.from([1, 2]), format: "webp" });
  await assert.rejects(() => imageResult({ data: [{ url: "https://example.test/not-image" }] }, (async () => new Response("x", { headers: { "content-type": "text/html" } })) as typeof fetch));
  await assert.rejects(() => imageResult({ data: [{ url: "https://example.test/empty" }] }, (async () => new Response(new Uint8Array(), { headers: { "content-type": "image/png" } })) as typeof fetch));
});

test("le profil expérimental est réservé à Flare et la revue échappe les valeurs", () => {
  assert.throws(() => buildBenchmarkRequest(corpus.cases[3], MINI_MODEL, "ingredient-816"));
  const html = renderReviewPage({ version:2, corpusSha256:corpusSha256("x"), startedAt:"", finishedAt:"", pricing: { source:"", verifiedAt:"", currency:"USD", formula:"", billingNotice:"standard-estimate-not-invoice", ratesPerMillionTokens:{ [MINI_MODEL]: { input:2, output:8 }, [FLARE_MODEL]: { input:2.5, output:15 } } }, aggregates:[], humanEvaluation:{}, attempts:[{ caseId:"<case>",useCase:"ingredient",model:"<model>",profile:"production",prompt:null,request:null,quality:null,dimensions:null,receivedDimensions:null,outputFormat:null,status:"failed",latencyMs:0,apiUsage:null,apiUsageAvailability:"unavailable",estimatedStandardCostUsd:null,error:"<error>",imageFile:null,humanEvaluation:{} }] });
  assert.match(html, /&lt;case&gt;/); assert.doesNotMatch(html, /<case>/); assert.match(html, /Icône ingrédient/);
});

test("continue après un échec fournisseur et une erreur de préparation", async () => {
  let calls = 0; const client = { images: { generate: async () => { calls += 1; if (calls === 2) throw new Error("provider failure"); return { data:[{ b64_json: Buffer.from("image").toString("base64") }] }; } } };
  const malformed = { ...corpus, cases: [...corpus.cases, { id:"broken",useCase:"ingredient" as const,input:{label:""} }] };
  const manifest = await runImageBenchmark(corpus, corpusSha256("corpus"), [MINI_MODEL, FLARE_MODEL], await mkdtemp(path.join(os.tmpdir(), "image-benchmark-")), client);
  assert.equal(manifest.attempts.length, 21); assert.equal(manifest.attempts[1].status, "failed"); assert.match(manifest.attempts[1].error ?? "", /provider failure/);
});

test("le rapport versionné couvre la grille, les indisponibilités et attend l'opérateur", async () => {
  const report = await readFile(fileURLToPath(new URL("../../../docs/IMAGE_MODEL_VALIDATION.md", import.meta.url)), "utf8");

  assert.match(report, /## Identité obligatoire de l'exécution/);
  assert.match(report, /`manifest\.json`/); assert.match(report, /`review\.html`/);
  assert.match(report, /## Consolidation des mesures API relevées/);
  assert.match(report, /21 tentatives/); assert.match(report, /ingredient-816/); assert.match(report, /non facturée/);
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
