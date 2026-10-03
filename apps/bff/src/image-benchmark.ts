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
export interface BenchmarkAttempt {
  caseId: string; useCase: ImageUseCase; model: string; prompt: string | null; request: Record<string, unknown> | null;
  quality: string | null; dimensions: string | null; outputFormat: string | null; status: "success" | "failed";
  latencyMs: number; apiUsage: unknown | null; apiUsageAvailability: "available" | "unavailable"; cost: unknown | null;
  error: string | null; imageFile: string | null; humanEvaluation: Record<string, never>;
}
export interface BenchmarkManifest { version: 1; corpusSha256: string; startedAt: string; finishedAt: string; attempts: BenchmarkAttempt[]; humanEvaluation: Record<string, never> }

const USE_CASES = ["recipe", "ingredient", "cooking_step"] as const;
const REVIEW_SIZES: Record<ImageUseCase, { label: string; width: number; height: number }> = {
  recipe: { label: "Carte recette", width: 320, height: 320 },
  ingredient: { label: "Icône ingrédient", width: 64, height: 64 },
  cooking_step: { label: "Illustration étape", width: 480, height: 270 }
};

export function corpusSha256(rawCorpus: string): string { return createHash("sha256").update(rawCorpus).digest("hex"); }
export function requireBenchmarkApiKey(apiKey: string | undefined): string {
  if (!apiKey) throw new Error("OPENAI_API_KEY est requis; aucun artefact n'a été créé.");
  return apiKey;
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
  for (const useCase of USE_CASES) if (counts[useCase] < 3) throw new Error(`Corpus invalide: trois cas ${useCase} requis.`);
  return corpus as BenchmarkCorpus;
}
export function buildBenchmarkRequest(item: BenchmarkCase, model: string): { prompt: string; request: Record<string, unknown>; quality: string; dimensions: string } {
  const prompt = item.useCase === "recipe" ? buildRecipeImagePrompt(item.input as GenerateRecipeImageInput) : item.useCase === "ingredient" ? buildIngredientImagePrompt(item.input as GenerateIngredientImageInput) : buildCookingStepImagePrompt(item.input as GenerateCookingStepImageInput);
  if (!prompt) throw new Error("Préparation impossible: entrée du cas invalide.");
  const params = buildImageParams(item.useCase);
  const isGptImage = model.startsWith("gpt-image-");
  const quality = isGptImage ? params.quality : "standard";
  const request: Record<string, unknown> = { model, prompt, n: 1, size: params.size, quality };
  if (!isGptImage) { request.response_format = "url"; request.style = "natural"; }
  return { prompt, request, quality, dimensions: params.size };
}
export function validateManifest(value: unknown): BenchmarkManifest {
  if (!value || typeof value !== "object") throw new Error("Manifeste invalide.");
  const manifest = value as Partial<BenchmarkManifest>;
  if (manifest.version !== 1 || typeof manifest.corpusSha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.corpusSha256) || !Array.isArray(manifest.attempts)) throw new Error("Manifeste invalide: identité ou tentatives.");
  for (const attempt of manifest.attempts) {
    if (!attempt || !USE_CASES.includes(attempt.useCase) || !["success", "failed"].includes(attempt.status) || typeof attempt.latencyMs !== "number" || !attempt.humanEvaluation || Object.keys(attempt.humanEvaluation).length) throw new Error("Manifeste invalide: tentative.");
    if (attempt.status === "success" && (!attempt.imageFile || !attempt.prompt || !attempt.request || !attempt.outputFormat)) throw new Error("Manifeste invalide: succès incomplet.");
  }
  return manifest as BenchmarkManifest;
}
function safeError(error: unknown): string { return (error instanceof Error ? error.message : "Erreur fournisseur inconnue.").replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 500); }
export async function imageResult(response: unknown, fetchFn: typeof fetch = fetch): Promise<{ bytes: Buffer; format: string }> {
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
function escapeHtml(value: unknown): string { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] as string); }
export function renderReviewPage(manifest: BenchmarkManifest): string {
  const cards = manifest.attempts.map((attempt) => {
    const size = REVIEW_SIZES[attempt.useCase];
    const visual = attempt.imageFile ? `<img src="${escapeHtml(attempt.imageFile)}" alt="${escapeHtml(attempt.caseId)} — ${escapeHtml(attempt.model)}">` : `<div class="missing">${escapeHtml(attempt.error ?? "Aucun rendu")}</div>`;
    const context = attempt.useCase === "recipe" ? `<div class="recipe-card">${visual}<span>Carte recette</span></div>` : attempt.useCase === "ingredient" ? `<div class="ingredient-chip">${visual}<span>Icône ingrédient</span></div>` : `<div class="step-media">${visual}<span>Média d'étape</span></div>`;
    return `<article class="${attempt.useCase}"><h2>${size.label}</h2>${context}<p><b>${escapeHtml(attempt.caseId)}</b><br>${escapeHtml(attempt.model)}<br>${escapeHtml(attempt.status)} · ${attempt.latencyMs} ms<br>${escapeHtml(attempt.dimensions ?? "—")} · ${escapeHtml(attempt.outputFormat ?? "—")}</p></article>`;
  }).join("\n");
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Revue benchmark visuels</title><style>body{font:16px system-ui;margin:24px;background:#faf9f6}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}article{background:white;padding:16px;border:1px solid #ddd}img{object-fit:cover;background:#eee}.recipe-card img{width:320px;height:320px}.ingredient-chip{display:flex;align-items:center;gap:12px}.ingredient-chip img{width:64px;height:64px;border-radius:50%}.step-media img{width:480px;height:270px;max-width:100%}.missing{height:80px;padding:12px;background:#fee;color:#900;white-space:pre-wrap}h1{grid-column:1/-1}</style><main><h1>Revue locale — corpus ${escapeHtml(manifest.corpusSha256)}</h1>${cards}</main></html>`;
}
export async function runImageBenchmark(corpus: BenchmarkCorpus, corpusHash: string, models: string[], outputDir: string, client: ImageApi = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as ImageApi): Promise<BenchmarkManifest> {
  await mkdir(outputDir, { recursive: true });
  const startedAt = new Date().toISOString(); const attempts: BenchmarkAttempt[] = [];
  for (const item of corpus.cases) for (const model of models) {
    const start = performance.now(); let prepared: ReturnType<typeof buildBenchmarkRequest> | undefined;
    try {
      prepared = buildBenchmarkRequest(item, model);
      const response = await client.images.generate(prepared.request);
      const image = await imageResult(response);
      const imageFile = `${item.id}--${model.replace(/[^a-zA-Z0-9._-]/g, "_")}.${image.format}`;
      await writeFile(path.join(outputDir, imageFile), image.bytes);
      const apiUsage = (response as { usage?: unknown }).usage ?? null;
      const cost = (response as { cost?: unknown }).cost ?? (apiUsage && typeof apiUsage === "object" ? (apiUsage as { cost?: unknown }).cost ?? null : null);
      attempts.push({ caseId:item.id,useCase:item.useCase,model,prompt:prepared.prompt,request:prepared.request,quality:prepared.quality,dimensions:prepared.dimensions,outputFormat:image.format,status:"success",latencyMs:Math.round(performance.now()-start),apiUsage,apiUsageAvailability:apiUsage === null ? "unavailable" : "available",cost,error:null,imageFile,humanEvaluation:{} });
    } catch (error) {
      attempts.push({ caseId:item.id,useCase:item.useCase,model,prompt:prepared?.prompt ?? null,request:prepared?.request ?? null,quality:prepared?.quality ?? null,dimensions:prepared?.dimensions ?? null,outputFormat:null,status:"failed",latencyMs:Math.round(performance.now()-start),apiUsage:null,apiUsageAvailability:"unavailable",cost:null,error:safeError(error),imageFile:null,humanEvaluation:{} });
    }
  }
  const manifest: BenchmarkManifest = { version:1, corpusSha256:corpusHash, startedAt, finishedAt:new Date().toISOString(), attempts, humanEvaluation:{} };
  validateManifest(manifest);
  await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest,null,2)}\n`);
  await writeFile(path.join(outputDir, "review.html"), renderReviewPage(manifest));
  return manifest;
}
