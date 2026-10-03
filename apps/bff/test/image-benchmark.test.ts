import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { assertBenchmarkOutputOutsideCache, buildBenchmarkRequest, corpusSha256, imageResult, renderReviewPage, requireBenchmarkApiKey, runImageBenchmark, validateCorpus, validateManifest, validateModels } from "../src/image-benchmark.js";

const corpus = validateCorpus({ version: 1, cases: [
  { id:"r1",useCase:"recipe",input:{title:"Tarte",ingredients:[{label:"tomate"}],steps:[{text:"Cuire"}]} }, { id:"r2",useCase:"recipe",input:{title:"Curry",ingredients:[{label:"pois chiche"}],steps:[{text:"Mijoter"}]} }, { id:"r3",useCase:"recipe",input:{title:"Crumble",ingredients:[{label:"pomme"}],steps:[{text:"Dorer"}]} },
  { id:"i1",useCase:"ingredient",input:{label:"tomate"} }, { id:"i2",useCase:"ingredient",input:{label:"citron"} }, { id:"i3",useCase:"ingredient",input:{label:"basilic"} },
  { id:"s1",useCase:"cooking_step",input:{stepText:"Saisir."} }, { id:"s2",useCase:"cooking_step",input:{stepText:"Fouetter."} }, { id:"s3",useCase:"cooking_step",input:{stepText:"Râper."} }
] });

test("valide strictement le corpus, les modèles et l'absence de clé", () => {
  assert.equal(corpus.cases.length, 9);
  assert.throws(() => validateCorpus({ version:1, cases: corpus.cases.slice(0, 8) }));
  assert.deepEqual(validateModels(["current", "candidate"], "current"), ["current", "candidate"]);
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
  const manifest = await runImageBenchmark(corpus, hash, ["current", "candidate"], output, client);
  assert.equal(requests.length, 18); assert.equal(manifest.corpusSha256, hash); assert.equal(manifest.attempts.filter((x) => x.status === "success").length, 18);
  assert.equal(manifest.attempts[0].request?.model, "current"); assert.deepEqual(manifest.attempts[0].apiUsage, { input_tokens: 1, cost: 0.04 }); assert.equal(manifest.attempts[0].cost, 0.04);
  assert.match(await readFile(path.join(output, "review.html"), "utf8"), /Icône ingrédient/);
  assert.equal(JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8")).corpusSha256, hash);
});

test("le chemin URL impose une image non vide typée et conserve son extension", async () => {
  const fetchMock = async () => new Response(new Uint8Array([1, 2]), { headers: { "content-type": "image/webp; charset=utf-8" } });
  assert.deepEqual(await imageResult({ data: [{ url: "https://example.test/image" }] }, fetchMock as typeof fetch), { bytes: Buffer.from([1, 2]), format: "webp" });
  await assert.rejects(() => imageResult({ data: [{ url: "https://example.test/not-image" }] }, (async () => new Response("x", { headers: { "content-type": "text/html" } })) as typeof fetch));
  await assert.rejects(() => imageResult({ data: [{ url: "https://example.test/empty" }] }, (async () => new Response(new Uint8Array(), { headers: { "content-type": "image/png" } })) as typeof fetch));
});

test("les candidats non GPT utilisent une requête compatible et la revue échappe les valeurs", () => {
  const request = buildBenchmarkRequest(corpus.cases[0], "dall-e-3").request;
  assert.equal(request.quality, "standard"); assert.equal(request.style, "natural"); assert.equal(request.response_format, "url");
  const html = renderReviewPage({ version:1, corpusSha256:corpusSha256("x"), startedAt:"", finishedAt:"", humanEvaluation:{}, attempts:[{ caseId:"<case>",useCase:"ingredient",model:"<model>",prompt:null,request:null,quality:null,dimensions:null,outputFormat:null,status:"failed",latencyMs:0,apiUsage:null,apiUsageAvailability:"unavailable",cost:null,error:"<error>",imageFile:null,humanEvaluation:{} }] });
  assert.match(html, /&lt;case&gt;/); assert.doesNotMatch(html, /<case>/); assert.match(html, /Icône ingrédient/);
});

test("continue après un échec fournisseur et une erreur de préparation", async () => {
  let calls = 0; const client = { images: { generate: async () => { calls += 1; if (calls === 2) throw new Error("provider failure"); return { data:[{ b64_json: Buffer.from("image").toString("base64") }] }; } } };
  const malformed = { ...corpus, cases: [...corpus.cases, { id:"broken",useCase:"ingredient" as const,input:{label:""} }] };
  const manifest = await runImageBenchmark(malformed, corpusSha256("malformed corpus"), ["current"], await mkdtemp(path.join(os.tmpdir(), "image-benchmark-")), client);
  assert.equal(manifest.attempts.length, 10); assert.equal(manifest.attempts[1].status, "failed"); assert.match(manifest.attempts[1].error ?? "", /provider failure/);
  assert.match(manifest.attempts[9].error ?? "", /Préparation impossible/); assert.equal(manifest.attempts[9].request, null);
});
