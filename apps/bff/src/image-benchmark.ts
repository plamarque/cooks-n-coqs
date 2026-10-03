import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as path from "node:path";
import OpenAI from "openai";
import type { ImageUseCase } from "./ai-config.js";
import { buildCookingStepImagePrompt, buildImageParams, buildIngredientImagePrompt, buildRecipeImagePrompt, type GenerateCookingStepImageInput, type GenerateIngredientImageInput, type GenerateRecipeImageInput } from "./image-generator.js";

export type BenchmarkInput = GenerateRecipeImageInput | GenerateIngredientImageInput | GenerateCookingStepImageInput;
export interface BenchmarkCase { id: string; useCase: ImageUseCase; input: BenchmarkInput }
export interface BenchmarkCorpus { version: 1; cases: BenchmarkCase[] }
export interface ImageApi { images: { generate(request: Record<string, unknown>): Promise<unknown> } }
export interface ReplicateApi { run(request: Record<string, unknown>): Promise<unknown> }
export interface BenchmarkClients { openai: ImageApi; replicate: ReplicateApi; fetchFn?: typeof fetch }
export interface BenchmarkAttempt {
  caseId: string; useCase: ImageUseCase; model: string; profile: "production" | "ingredient-816"; prompt: string | null; request: Record<string, unknown> | null;
  quality: string | null; dimensions: string | null; receivedDimensions: string | null; outputFormat: string | null; status: "success" | "failed";
  latencyMs: number; apiUsage: { inputTokens: number; outputTokens: number; totalTokens: number | null } | null; apiUsageAvailability: "available" | "unavailable"; costMethod: "openai-token-estimate" | "replicate-unit-price"; estimatedStandardCostUsd: number | null;
  error: string | null; imageFile: string | null; humanEvaluation: Record<string, never>;
}
export interface BenchmarkManifest { version: 2; corpusSha256: string; startedAt: string; finishedAt: string; pricing: typeof PRICING; attempts: BenchmarkAttempt[]; aggregates: ReturnType<typeof aggregateAttempts>; humanEvaluation: Record<string, never> }

export const MINI_MODEL = "gpt-image-1-mini";
export const FLARE_MODEL = "gpt-image-2.5-flare";
export const FLUX_SCHNELL_MODEL = "black-forest-labs/flux-schnell";
export const FLUX_SCHNELL_UNIT_COST_USD = 0.003;
export const PRICING = { source: "https://developers.openai.com/api/docs/models/gpt-image-1-mini ; https://developers.openai.com/api/docs/models/gpt-image-2.5-flare ; https://replicate.com/black-forest-labs/flux-schnell", verifiedAt: "2026-10-03", currency: "USD", formula: "OpenAI: (inputTokens × input USD/1M + outputTokens × output USD/1M) / 1,000,000; Replicate FLUX Schnell: USD 0.003 per successful image", billingNotice: "standard-estimate-not-invoice", ratesPerMillionTokens: { [MINI_MODEL]: { input: 2, output: 8 }, [FLARE_MODEL]: { input: 5, output: 30 } }, providerUnitCostsUsd: { [FLUX_SCHNELL_MODEL]: FLUX_SCHNELL_UNIT_COST_USD } } as const;

const USE_CASES = ["recipe", "ingredient", "cooking_step"] as const;
const REVIEW_SIZES: Record<ImageUseCase, { label: string; width: number; height: number }> = {
  recipe: { label: "Carte recette", width: 320, height: 320 },
  ingredient: { label: "Icône ingrédient", width: 64, height: 64 },
  cooking_step: { label: "Illustration étape", width: 480, height: 270 }
};

export function corpusSha256(rawCorpus: string): string { return createHash("sha256").update(rawCorpus).digest("hex"); }
export function requireBenchmarkApiKey(apiKey: string | undefined): string {
  const normalized = apiKey?.trim();
  if (!normalized) throw new Error("OPENAI_API_KEY est requis; aucun artefact n'a été créé.");
  return normalized;
}
export function requireReplicateApiToken(token: string | undefined): string {
  const normalized = token?.trim();
  if (!normalized) throw new Error("REPLICATE_API_TOKEN est requis; aucun artefact n'a été créé.");
  return normalized;
}
export function assertBenchmarkOutputOutsideCache(outputRoot: string, cacheDir: string): void {
  const resolvedOutput = path.resolve(outputRoot);
  const resolvedCache = path.resolve(cacheDir);
  if (resolvedOutput === resolvedCache || !path.relative(resolvedCache, resolvedOutput).startsWith(".." + path.sep) && path.relative(resolvedCache, resolvedOutput) !== "..") {
    throw new Error("La sortie benchmark ne peut pas être située dans le cache BFF de génération.");
  }
}
export function validateModels(models: string[], currentModel: string): string[] {
  const clean = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
  if (!currentModel.trim() || clean.length === 0 || !clean.includes(currentModel)) throw new Error("Les modèles explicites doivent inclure le modèle courant.");
  return clean;
}
export function validateDecisionModels(models: string[]): [string, string, string] {
  const clean = [...new Set(models.map((model) => model.trim()).filter(Boolean))];
  if (clean.length !== 3 || !clean.includes(MINI_MODEL) || !clean.includes(FLARE_MODEL) || !clean.includes(FLUX_SCHNELL_MODEL)) throw new Error(`Le run décisionnel exige exactement ${MINI_MODEL},${FLARE_MODEL},${FLUX_SCHNELL_MODEL}.`);
  return [MINI_MODEL, FLARE_MODEL, FLUX_SCHNELL_MODEL];
}
export function validateCorpus(value: unknown): BenchmarkCorpus {
  if (!value || typeof value !== "object") throw new Error("Corpus invalide.");
  const corpus = value as Partial<BenchmarkCorpus>;
  if (corpus.version !== 1 || !Array.isArray(corpus.cases)) throw new Error("Corpus invalide: version 1 et cas requis.");
  const counts: Record<ImageUseCase, number> = { recipe: 0, ingredient: 0, cooking_step: 0 };
  const ids = new Set<string>();
  for (const item of corpus.cases) {
    if (!item || typeof item.id !== "string" || !/^[a-z0-9-]+$/.test(item.id) || ids.has(item.id)) throw new Error("Corpus invalide: identifiant.");
    ids.add(item.id);
    if (!(USE_CASES as readonly string[]).includes(item.useCase) || !item.input || typeof item.input !== "object") throw new Error("Corpus invalide: usage ou entrée.");
    if (item.useCase === "recipe") {
      const input = item.input as GenerateRecipeImageInput;
      if (!input.title?.trim() || !Array.isArray(input.ingredients) || !input.ingredients.length || !input.ingredients.every((ingredient) => typeof ingredient?.label === "string" && ingredient.label.trim()) || !Array.isArray(input.steps) || !input.steps.length || !input.steps.every((step) => typeof step?.text === "string" && step.text.trim())) throw new Error("Corpus invalide: recette incomplète.");
    }
    if (item.useCase === "ingredient" && !((item.input as GenerateIngredientImageInput).label?.trim())) throw new Error("Corpus invalide: ingrédient incomplet.");
    if (item.useCase === "cooking_step" && !((item.input as GenerateCookingStepImageInput).stepText?.trim())) throw new Error("Corpus invalide: étape incomplète.");
    counts[item.useCase] += 1;
  }
  for (const useCase of USE_CASES) if (counts[useCase] !== 3) throw new Error(`Corpus invalide: exactement trois cas ${useCase} requis.`);
  return corpus as BenchmarkCorpus;
}
export function buildBenchmarkRequest(item: BenchmarkCase, model: string, profile: "production" | "ingredient-816" = "production"): { prompt: string; request: Record<string, unknown>; quality: string; dimensions: string } {
  if (profile === "ingredient-816" && (item.useCase !== "ingredient" || model !== FLARE_MODEL)) throw new Error("Le profil ingredient-816 est réservé à Flare pour un ingrédient.");
  const prompt = item.useCase === "recipe" ? buildRecipeImagePrompt(item.input as GenerateRecipeImageInput) : item.useCase === "ingredient" ? buildIngredientImagePrompt(item.input as GenerateIngredientImageInput) : buildCookingStepImagePrompt(item.input as GenerateCookingStepImageInput);
  if (!prompt) throw new Error("Préparation impossible: entrée du cas invalide.");
  const params = buildImageParams(item.useCase); const dimensions = profile === "ingredient-816" ? "816x816" : params.size;
  if (model === FLUX_SCHNELL_MODEL) return { prompt, request: { model, input: { prompt, aspect_ratio: "1:1", megapixels: "1", go_fast: true, output_format: "webp", num_inference_steps: 4 } }, quality: "fast", dimensions: "~1MP (1:1)" };
  return { prompt, request: { model, prompt, n: 1, size: dimensions, quality: "low" }, quality: "low", dimensions };
}
export function normalizeUsage(value: unknown): BenchmarkAttempt["apiUsage"] { const usage = value as Record<string, unknown> | null; if (!usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens) || Number(usage.input_tokens) < 0 || Number(usage.output_tokens) < 0) return null; return { inputTokens: Number(usage.input_tokens), outputTokens: Number(usage.output_tokens), totalTokens: Number.isSafeInteger(usage.total_tokens) && Number(usage.total_tokens) >= 0 ? Number(usage.total_tokens) : null }; }
export function estimateStandardCost(model: string, usage: BenchmarkAttempt["apiUsage"]): number | null { const rate = PRICING.ratesPerMillionTokens[model as keyof typeof PRICING.ratesPerMillionTokens]; return rate && usage ? (usage.inputTokens * rate.input + usage.outputTokens * rate.output) / 1_000_000 : null; }
export function benchmarkCost(model: string, status: BenchmarkAttempt["status"], usage: BenchmarkAttempt["apiUsage"]): number | null { return model === FLUX_SCHNELL_MODEL ? status === "success" ? FLUX_SCHNELL_UNIT_COST_USD : null : estimateStandardCost(model, usage); }
export function aggregateAttempts(attempts: BenchmarkAttempt[]) { return [...new Map(attempts.map((attempt) => [`${attempt.model}:${attempt.useCase}:${attempt.profile}`, attempts.filter((x) => x.model === attempt.model && x.useCase === attempt.useCase && x.profile === attempt.profile)])).values()].map((group) => ({ model: group[0].model, useCase: group[0].useCase, profile: group[0].profile, costMethod: group[0].costMethod, attempts: group.length, successes: group.filter((x) => x.status === "success").length, failures: group.filter((x) => x.status === "failed").length, averageLatencyMs: Math.round(group.reduce((sum, x) => sum + x.latencyMs, 0) / group.length), inputTokens: group.every((x) => x.apiUsage) ? group.reduce((sum, x) => sum + (x.apiUsage?.inputTokens ?? 0), 0) : null, outputTokens: group.every((x) => x.apiUsage) ? group.reduce((sum, x) => sum + (x.apiUsage?.outputTokens ?? 0), 0) : null, estimatedStandardCostUsd: group.every((x) => x.estimatedStandardCostUsd !== null) ? group.reduce((sum, x) => sum + (x.estimatedStandardCostUsd ?? 0), 0) : null })); }
export function validateManifest(value: unknown): BenchmarkManifest {
  if (!value || typeof value !== "object") throw new Error("Manifeste invalide.");
  const manifest = value as Partial<BenchmarkManifest>;
  if (manifest.version !== 2 || typeof manifest.corpusSha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.corpusSha256) || !Array.isArray(manifest.attempts) || !manifest.pricing || !Array.isArray(manifest.aggregates)) throw new Error("Manifeste invalide: identité ou tentatives.");
  for (const attempt of manifest.attempts) {
    if (!attempt || !USE_CASES.includes(attempt.useCase) || !["production", "ingredient-816"].includes(attempt.profile) || !["success", "failed"].includes(attempt.status) || !["openai-token-estimate", "replicate-unit-price"].includes(attempt.costMethod) || typeof attempt.latencyMs !== "number" || !attempt.humanEvaluation || Object.keys(attempt.humanEvaluation).length) throw new Error("Manifeste invalide: tentative.");
    if (attempt.status === "success" && (!attempt.imageFile || !attempt.prompt || !attempt.request || !attempt.outputFormat)) throw new Error("Manifeste invalide: succès incomplet.");
    if (attempt.model === FLUX_SCHNELL_MODEL && (attempt.costMethod !== "replicate-unit-price" || attempt.apiUsage !== null || attempt.apiUsageAvailability !== "unavailable" || (attempt.status === "success" && attempt.estimatedStandardCostUsd !== FLUX_SCHNELL_UNIT_COST_USD))) throw new Error("Manifeste invalide: invariant FLUX.");
  }
  const expected = [...[MINI_MODEL, FLARE_MODEL, FLUX_SCHNELL_MODEL].flatMap((model) => USE_CASES.flatMap((useCase) => manifest.attempts!.filter((x) => x.model === model && x.useCase === useCase && x.profile === "production").length === 3 ? [true] : [])), ...manifest.attempts.filter((x) => x.model === FLARE_MODEL && x.useCase === "ingredient" && x.profile === "ingredient-816").length === 3 ? [true] : []];
  if (manifest.attempts.length !== 30 || expected.length !== 10) throw new Error("Manifeste invalide: matrice décisionnelle.");
  return manifest as BenchmarkManifest;
}
function safeError(error: unknown): string { return (error instanceof Error ? error.message : "Erreur fournisseur inconnue.").replace(/(?:sk|r8)_[A-Za-z0-9_-]+/g, "[redacted]").replace(/https?:\/\/\S+/g, "[redacted-url]").slice(0, 500); }
export async function imageResult(response: unknown, fetchFn: typeof fetch = fetch): Promise<{ bytes: Buffer; format: string; receivedDimensions?: string | null }> {
  const first = (response as { data?: Array<{ b64_json?: unknown; url?: unknown }> }).data?.[0];
  if (typeof first?.b64_json === "string") return { bytes: Buffer.from(first.b64_json, "base64"), format: "png" };
  if (typeof first?.url === "string") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let fetched: Response;
    try { fetched = await fetchFn(first.url, { signal: controller.signal }); } catch { throw new Error("Téléchargement du rendu fournisseur impossible ou expiré."); } finally { clearTimeout(timeout); }
    if (!fetched.ok) throw new Error("Téléchargement du rendu fournisseur impossible.");
    const type = (fetched.headers.get("content-type") ?? "").split(";", 1)[0].toLowerCase();
    const format = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[type];
    if (!format) throw new Error("Le rendu URL fournisseur n'est pas une image PNG, JPEG ou WebP.");
    const bytes = Buffer.from(await fetched.arrayBuffer());
    if (!bytes.length) throw new Error("Le rendu URL fournisseur est vide.");
    return { bytes, format };
  }
  throw new Error("Le fournisseur n'a produit aucune image.");
}
export async function replicateImageResult(response: unknown, fetchFn: typeof fetch = fetch): Promise<{ bytes: Buffer; format: string; receivedDimensions: string | null }> {
  const output = (response as { output?: unknown }).output;
  const url = Array.isArray(output) ? output[0] : output;
  if (typeof url !== "string") throw new Error("Le fournisseur Replicate n'a produit aucune image.");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("URL de sortie Replicate invalide."); }
  if (parsed.protocol !== "https:" || (parsed.hostname !== "replicate.delivery" && !parsed.hostname.endsWith(".replicate.delivery"))) throw new Error("URL de sortie Replicate non autorisée.");
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15_000);
  let bytes: Buffer;
  try {
    const fetched = await fetchFn(url, { signal: controller.signal, redirect: "error" });
    if (!fetched.ok) throw new Error("Téléchargement du rendu Replicate impossible.");
    const type = (fetched.headers.get("content-type") ?? "").split(";", 1)[0].toLowerCase();
    if (type !== "image/webp") throw new Error("Le rendu Replicate n'est pas une image WebP.");
    const contentLength = Number(fetched.headers.get("content-length") ?? "0");
    if (!Number.isFinite(contentLength) || contentLength > 10 * 1024 * 1024) throw new Error("Rendu Replicate trop volumineux.");
    bytes = Buffer.from(await fetched.arrayBuffer());
  } catch (error) { if (error instanceof Error && error.message.startsWith("Téléchargement") || error instanceof Error && error.message.startsWith("Le rendu") || error instanceof Error && error.message.startsWith("Rendu")) throw error; throw new Error("Téléchargement du rendu Replicate impossible ou expiré."); } finally { clearTimeout(timeout); }
  if (bytes.length > 10 * 1024 * 1024) throw new Error("Rendu Replicate trop volumineux.");
  if (bytes.length < 16 || bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WEBP") throw new Error("Le rendu Replicate n'est pas une image WebP valide.");
  const chunk = bytes.subarray(12, 16).toString("ascii"); let width: number | null = null; let height: number | null = null;
  if (chunk === "VP8X" && bytes.length >= 30) { width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3); }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) { width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff; }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) { const packed = bytes.readUInt32LE(21); width = (packed & 0x3fff) + 1; height = ((packed >>> 14) & 0x3fff) + 1; }
  if (!width || !height) throw new Error("Dimensions du rendu Replicate indisponibles.");
  return { bytes, format: "webp", receivedDimensions: `${width}x${height}` };
}
async function replicateFetch(fetchFn: typeof fetch, url: string, init: RequestInit): Promise<Response> { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15_000); try { return await fetchFn(url, { ...init, signal: controller.signal }); } catch { throw new Error("Requête Replicate impossible ou expirée."); } finally { clearTimeout(timeout); } }
export function createReplicateApi(token: string, fetchFn: typeof fetch = fetch): ReplicateApi {
  return { async run(request) {
    const created = await replicateFetch(fetchFn, `https://api.replicate.com/v1/models/${FLUX_SCHNELL_MODEL}/predictions`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ input: (request as { input: unknown }).input }) });
    if (!created.ok) throw new Error("Création de prédiction Replicate impossible.");
    let prediction = await created.json() as { status?: unknown; urls?: { get?: unknown }; error?: unknown };
    for (let attempts = 0; attempts < 120; attempts += 1) {
      if (prediction.status === "succeeded") return prediction;
      if (prediction.status === "failed" || prediction.status === "canceled") throw new Error("Prédiction Replicate en échec.");
      if (typeof prediction.urls?.get !== "string") throw new Error("Réponse Replicate invalide.");
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const polled = await replicateFetch(fetchFn, prediction.urls.get, { headers: { Authorization: `Bearer ${token}` } });
      if (!polled.ok) throw new Error("Lecture de prédiction Replicate impossible.");
      prediction = await polled.json() as typeof prediction;
    }
    throw new Error("Prédiction Replicate expirée.");
  } };
}
function escapeHtml(value: unknown): string { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] as string); }
export function renderReviewPage(manifest: BenchmarkManifest): string {
  const cards = manifest.attempts.map((attempt) => {
    const size = REVIEW_SIZES[attempt.useCase];
    const visual = attempt.imageFile ? `<img src="${escapeHtml(attempt.imageFile)}" alt="${escapeHtml(attempt.caseId)} — ${escapeHtml(attempt.model)}">` : `<div class="missing">${escapeHtml(attempt.error ?? "Aucun rendu")}</div>`;
    const context = attempt.useCase === "recipe" ? `<div class="recipe-card">${visual}<span>Carte recette</span></div>` : attempt.useCase === "ingredient" ? `<div class="ingredient-chip">${visual}<span>Icône ingrédient</span></div>` : `<div class="step-media">${visual}<span>Média d'étape</span></div>`;
    const api = attempt.apiUsage ? `${attempt.apiUsage.inputTokens} entrée / ${attempt.apiUsage.outputTokens} sortie` : "indisponible";
    const estimate = attempt.estimatedStandardCostUsd === null ? "indisponible" : `$${attempt.estimatedStandardCostUsd.toFixed(6)}`;
    const costLabel = attempt.model === FLUX_SCHNELL_MODEL ? "Coût fournisseur Replicate par image réussie (non facture)" : "Estimation OpenAI tokenisée standard (non facturée)";
    return `<article class="${attempt.useCase}"><h2>${size.label}</h2>${context}<p><b>${escapeHtml(attempt.caseId)}</b><br>${escapeHtml(attempt.model)} · ${escapeHtml(attempt.profile)}<br>${escapeHtml(attempt.status)} · ${attempt.latencyMs} ms<br>Demandé: ${escapeHtml(attempt.dimensions ?? "—")} · Reçu: ${escapeHtml(attempt.receivedDimensions ?? "indisponible")}<br>Tokens API: ${api}<br>Méthode de coût: ${escapeHtml(attempt.costMethod)}<br>${costLabel}: ${estimate}</p></article>`;
  }).join("\n");
  const aggregates = manifest.aggregates.map((x) => `<tr><td>${escapeHtml(x.model)}</td><td>${escapeHtml(x.useCase)}</td><td>${escapeHtml(x.profile)}</td><td>${escapeHtml(x.costMethod)}</td><td>${x.successes}/${x.attempts}</td><td>${x.averageLatencyMs}</td><td>${x.inputTokens ?? "indisponible"}/${x.outputTokens ?? "indisponible"}</td><td>${x.estimatedStandardCostUsd ?? "indisponible"}</td></tr>`).join("");
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Revue benchmark visuels</title><style>body{font:16px system-ui;margin:24px;background:#faf9f6}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}article,section{background:white;padding:16px;border:1px solid #ddd}img{object-fit:cover;background:#eee}.recipe-card img{width:320px;height:320px}.ingredient-chip{display:flex;align-items:center;gap:12px}.ingredient-chip img{width:64px;height:64px;border-radius:50%}.step-media img{width:480px;height:270px;max-width:100%}.missing{height:80px;padding:12px;background:#fee;color:#900;white-space:pre-wrap}h1{grid-column:1/-1}table{border-collapse:collapse}td,th{padding:4px;border:1px solid #ddd}</style><main><section><h1>Revue locale — corpus ${escapeHtml(manifest.corpusSha256)}</h1><p>Tarification ${manifest.pricing.verifiedAt}; les coûts OpenAI tokenisés et le coût fournisseur Replicate sont des estimations non facturées, pas des factures. Formule: ${escapeHtml(manifest.pricing.formula)}</p><h2>Agrégats modèle × usage × profil</h2><table><tr><th>Modèle</th><th>Usage</th><th>Profil</th><th>Méthode coût</th><th>Succès</th><th>Latence moyenne</th><th>Tokens API</th><th>Coût estimé non facturé</th></tr>${aggregates}</table></section>${cards}</main></html>`;
}
export async function runImageBenchmark(corpus: BenchmarkCorpus, corpusHash: string, models: string[], outputDir: string, clients: BenchmarkClients = { openai: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as ImageApi, replicate: createReplicateApi(requireReplicateApiToken(process.env.REPLICATE_API_TOKEN)) }): Promise<BenchmarkManifest> {
  const decisionModels = validateDecisionModels(models);
  await mkdir(outputDir, { recursive: true });
  const startedAt = new Date().toISOString(); const attempts: BenchmarkAttempt[] = [];
  const matrix: Array<{ item: BenchmarkCase; model: string; profile: "production" | "ingredient-816" }> = [...decisionModels.flatMap((model) => corpus.cases.map((item) => ({ item, model, profile: "production" as const }))), ...corpus.cases.filter((item) => item.useCase === "ingredient").map((item) => ({ item, model: FLARE_MODEL, profile: "ingredient-816" as const }))];
  for (const { item, model, profile } of matrix) {
    const start = performance.now(); let prepared: ReturnType<typeof buildBenchmarkRequest> | undefined;
    try {
      prepared = buildBenchmarkRequest(item, model, profile);
      const response = model === FLUX_SCHNELL_MODEL ? await clients.replicate.run(prepared.request) : await clients.openai.images.generate(prepared.request);
      const image = model === FLUX_SCHNELL_MODEL ? await replicateImageResult(response, clients.fetchFn) : await imageResult(response, clients.fetchFn);
      const imageFile = `${item.id}--${model.replace(/[^a-zA-Z0-9._-]/g, "_")}--${profile}.${image.format}`;
      await writeFile(path.join(outputDir, imageFile), image.bytes);
      const apiUsage = model === FLUX_SCHNELL_MODEL ? null : normalizeUsage((response as { usage?: unknown }).usage);
      const receivedDimensions = model === FLUX_SCHNELL_MODEL ? image.receivedDimensions ?? null : ((response as { data?: Array<{ size?: unknown }> }).data?.[0]?.size as string | undefined) ?? null;
      attempts.push({ caseId:item.id,useCase:item.useCase,model,profile,prompt:prepared.prompt,request:prepared.request,quality:prepared.quality,dimensions:prepared.dimensions,receivedDimensions,outputFormat:image.format,status:"success",latencyMs:Math.round(performance.now()-start),apiUsage,apiUsageAvailability:apiUsage ? "available" : "unavailable",costMethod:model === FLUX_SCHNELL_MODEL ? "replicate-unit-price" : "openai-token-estimate",estimatedStandardCostUsd:benchmarkCost(model, "success", apiUsage),error:null,imageFile,humanEvaluation:{} });
    } catch (error) {
      attempts.push({ caseId:item.id,useCase:item.useCase,model,profile,prompt:prepared?.prompt ?? null,request:prepared?.request ?? null,quality:prepared?.quality ?? null,dimensions:prepared?.dimensions ?? null,receivedDimensions:null,outputFormat:null,status:"failed",latencyMs:Math.round(performance.now()-start),apiUsage:null,apiUsageAvailability:"unavailable",costMethod:model === FLUX_SCHNELL_MODEL ? "replicate-unit-price" : "openai-token-estimate",estimatedStandardCostUsd:null,error:safeError(error),imageFile:null,humanEvaluation:{} });
    }
  }
  const manifest: BenchmarkManifest = { version:2, corpusSha256:corpusHash, startedAt, finishedAt:new Date().toISOString(), pricing:PRICING, attempts, aggregates:aggregateAttempts(attempts), humanEvaluation:{} };
  validateManifest(manifest);
  await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest,null,2)}\n`);
  await writeFile(path.join(outputDir, "review.html"), renderReviewPage(manifest));
  return manifest;
}
