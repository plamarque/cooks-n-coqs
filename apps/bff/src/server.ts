import { envPath, envResult } from "./load-env.js";
import { pathToFileURL } from "node:url";
import cors from "cors";
import express from "express";
import multer from "multer";
import {
  extractImageFromUrl,
  parseRecipeWithCloud,
  reorderStepsByRecipeLogic
} from "./parsing-client.js";
import type { ParseRecipeInput } from "./parsing-client.js";
import {
  buildCookingStepImageCacheKey,
  buildIngredientImageCacheKey,
  buildRecipeImageCacheKey,
  deleteCachedImageByKey,
  describeGeneratedImageStorage,
  getCachedImageByKey,
  resolveCachedImageUrl
} from "./image-cache.js";
import { getImageModel, getImageQuality } from "./ai-config.js";
import {
  generateCookingStepImage,
  generateIngredientImage,
  generateRecipeImage
} from "./image-generator.js";
import { detectStepTimerDurationSeconds } from "./step-timer-detector.js";
import { chooseNotebookRecipe, generateAssistantRecipe, getChefAdvice, getChefTurnClassification, isAssistantRecipeInput, isAssistantSelectionInput, summarizeAssistantImage, validateAssistantRecipeDraft, writeAssistantClarification } from "./assistant-client.js";
import { isChefAdviceRequestV1, isChefAdviceWireV1 } from "@cookies-et-coquilettes/domain/chef-advice";
import { isChefTurnClassificationRequestV1, isChefTurnClassificationWireV1 } from "@cookies-et-coquilettes/domain/chef-turn-classification";

/** Point d’injection réservé aux tests HTTP : aucun fournisseur réel n’est appelé. */
export const assistantDependencies = {
  choose: chooseNotebookRecipe,
  summarizeImage: summarizeAssistantImage,
  clarify: writeAssistantClarification,
  generate: generateAssistantRecipe,
  advice: getChefAdvice,
  classifyTurn: getChefTurnClassification
};

export const app = express();
// Le BFF est servi derrière le proxy TLS Tailscale : req.protocol doit refléter
// X-Forwarded-Proto pour que les URLs d'images soient récupérables par le navigateur.
// Seul le proxy local est digne de confiance : une requête directe ne doit pas
// pouvoir forger son protocole public avec cet en-tête.
app.set("trust proxy", "loopback");
const upload = multer();
const assistantImageUpload = multer({ limits: { files: 5, fileSize: 4 * 1024 * 1024, fields: 1, fieldSize: 1_200, parts: 6 } });
const port = Number(process.env.PORT ?? 8787);
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
const generatedImageAdminToken = process.env.GENERATED_IMAGE_ADMIN_TOKEN?.trim();

app.use(
  cors({
    origin: corsOrigin === "*" ? true : corsOrigin
  })
);
app.use(express.json({ limit: "4mb" }));

type AssistantDiagnostic = {
  stage: "vision" | "selection" | "generation" | "advice" | "classification";
  provider: "jev" | "luna" | "openai" | "none";
  errorClass: "none" | "invalid_input" | "upstream_unavailable" | "cancelled";
  httpStatus?: number;
  durationMs: number;
  candidateCount: number;
  requestId: string;
  imageIndex?: number;
  attempt?: number;
  outcome?: "ok" | "truncated" | "empty" | "timeout" | "provider_error" | "network_error";
  providerStatus?: number;
};

/** Diagnostic volontairement réduit : jamais de demande, recette, en-tête ni réponse fournisseur. */
function traceAssistant(diagnostic: AssistantDiagnostic): void {
  console.info("assistant_diagnostic", diagnostic);
}

function assistantRequestId(req?: express.Request): string {
  const clientId = req?.query.attempt;
  if (typeof clientId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) return clientId;
  return crypto.randomUUID();
}
function assistantClarificationCount(turns: unknown): number {
  return Array.isArray(turns) ? turns.filter((turn) => turn?.role === "assistant").length : 0;
}
function assistantError(res: express.Response, requestId: string, status: number, body: object): void {
  res.setHeader("x-request-id", requestId);
  res.status(status).json(body);
}
function assistantImageUploadHandler(field: string, many: boolean): express.RequestHandler {
  const middleware = many ? assistantImageUpload.array(field, 5) : assistantImageUpload.single(field);
  return (req, res, next) => middleware(req, res, (error) => {
    if (!error) return next();
    const status = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    // Diagnostic sans contenu utilisateur : rend les erreurs multipart
    // distinguables d'une indisponibilité du modèle vision.
    const requestId = assistantRequestId(req);
    traceAssistant({ stage: "vision", provider: "none", errorClass: "invalid_input", httpStatus: status, durationMs: 0, candidateCount: 0, requestId });
    assistantError(res, requestId, status, { error: "INVALID_IMAGE" });
  });
}

function isGeneratedImageAdminAuthorized(req: express.Request): boolean {
  if (!generatedImageAdminToken) {
    return false;
  }

  const bearer = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const headerToken = req.header("x-admin-token")?.trim();
  return bearer === generatedImageAdminToken || headerToken === generatedImageAdminToken;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/step-timer-duration", async (req, res) => {
  const stepText = req.body?.stepText as string | undefined;
  if (!stepText?.trim()) {
    res.status(400).json({ error: "stepText is required" });
    return;
  }

  const durationSeconds = await detectStepTimerDurationSeconds(stepText);
  res.json({ durationSeconds: durationSeconds ?? null });
});

app.post("/api/assistant/select", async (req, res) => {
  const requestId = assistantRequestId();
  const startedAt = Date.now();
  if (!isAssistantSelectionInput(req.body)) {
    traceAssistant({ stage: "selection", provider: "none", errorClass: "invalid_input", httpStatus: 400, durationMs: Date.now() - startedAt, candidateCount: 0, requestId });
    assistantError(res, requestId, 400, { kind: "selectionUnavailable" }); return;
  }
  const controller = new AbortController();
  req.once("aborted", () => controller.abort());
  res.once("close", () => { if (!res.writableEnded) controller.abort(); });
  let choice;
  try {
    choice = await assistantDependencies.choose({ request: req.body.request.trim(), candidates: req.body.candidates }, controller.signal);
  } catch {
    if (!controller.signal.aborted) traceAssistant({ stage: "selection", provider: "none", errorClass: "upstream_unavailable", httpStatus: 503, durationMs: Date.now() - startedAt, candidateCount: req.body.candidates.length, requestId });
    if (!controller.signal.aborted) assistantError(res, requestId, 503, { kind: "selectionUnavailable" });
    return;
  }
  if (controller.signal.aborted) {
    traceAssistant({ stage: "selection", provider: "jev", errorClass: "cancelled", durationMs: Date.now() - startedAt, candidateCount: req.body.candidates.length, requestId });
    return;
  }
  const selectedRefs = choice?.kind === "candidates"
    ? [...new Set(choice.candidateRefs)].filter((candidateRef) => req.body.candidates.some((candidate: { candidateRef: string }) => candidate.candidateRef === candidateRef)).slice(0, 3)
    : [];
  const validChoice = choice?.kind === "noCandidate" || selectedRefs.length > 0;
  traceAssistant({ stage: "selection", provider: validChoice && choice ? choice.provider : "none", errorClass: validChoice ? "none" : "upstream_unavailable", httpStatus: validChoice ? 200 : 503, durationMs: Date.now() - startedAt, candidateCount: req.body.candidates.length, requestId });
  res.setHeader("x-request-id", requestId);
  res.status(validChoice ? 200 : 503).json(validChoice ? choice!.kind === "candidates"
    ? { kind: "candidates", candidates: selectedRefs.map((candidateRef) => ({ candidateRef, reasonCode: "RELEVANT" })) }
    : { kind: "noCandidate" }
    : { kind: "selectionUnavailable" });
});

async function summarizeAssistantImages(req: express.Request, res: express.Response): Promise<void> {
  const requestId = assistantRequestId(req);
  const startedAt = Date.now();
  const files = (req.files as Express.Multer.File[] | undefined) ?? (req.file ? [req.file] : []);
  if (!files.length || files.length > 5 || files.some((file) => !file.buffer || !file.mimetype.startsWith("image/") || file.size > 4 * 1024 * 1024)) {
    traceAssistant({ stage: "vision", provider: "openai", errorClass: "invalid_input", httpStatus: 400, durationMs: Date.now() - startedAt, candidateCount: files.length, requestId });
    assistantError(res, requestId, 400, { error: "INVALID_IMAGE" }); return;
  }
  const controller = new AbortController();
  req.once("aborted", () => controller.abort());
  res.once("close", () => { if (!res.writableEnded) controller.abort(); });
  const summaries: Array<string | null> = [];
  const contextText = typeof req.body?.contextText === "string" ? req.body.contextText : "";
  try {
    // Une analyse vision à la fois : cinq photos ne doivent pas provoquer une rafale
    // vers le fournisseur ni faire échouer tout le lot par saturation temporaire.
    for (const [imageIndex, file] of files.entries()) {
      summaries.push(await assistantDependencies.summarizeImage(file.buffer, file.mimetype, contextText, controller.signal, (event) => {
        traceAssistant({ stage: "vision", provider: "openai", errorClass: event.outcome === "ok" || event.outcome === "truncated" ? "none" : "upstream_unavailable", durationMs: event.durationMs, candidateCount: files.length, requestId, imageIndex: imageIndex + 1, attempt: event.attempt, outcome: event.outcome, providerStatus: event.providerStatus });
      }));
    }
  } catch { summaries.length = 0; }
  if (controller.signal.aborted) { traceAssistant({ stage: "vision", provider: "openai", errorClass: "cancelled", durationMs: Date.now() - startedAt, candidateCount: files.length, requestId }); return; }
  if (summaries.length !== files.length || summaries.some((summary) => !summary)) {
    traceAssistant({ stage: "vision", provider: "openai", errorClass: "upstream_unavailable", httpStatus: 503, durationMs: Date.now() - startedAt, candidateCount: files.length, requestId });
    assistantError(res, requestId, 503, { error: "UPSTREAM_UNAVAILABLE" }); return;
  }
  res.setHeader("x-request-id", requestId);
  traceAssistant({ stage: "vision", provider: "openai", errorClass: "none", httpStatus: 200, durationMs: Date.now() - startedAt, candidateCount: files.length, requestId });
  res.json({ summaries });
}

/** Plusieurs photos sont résumées dans le même tour temporaire, sans écriture ni journal de contenu. */
app.post("/api/assistant/image-intents", assistantImageUploadHandler("files", true), summarizeAssistantImages);
// Compatibilité transitoire du client mono-image déjà déployé.
app.post("/api/assistant/image-intent", assistantImageUploadHandler("file", false), summarizeAssistantImages);

app.post("/api/assistant/recipe", async (req, res) => {
  const requestId = assistantRequestId();
  const startedAt = Date.now();
  const request = typeof req.body?.request === "string" ? req.body.request.trim() : "";
  if (!request) { traceAssistant({ stage: "generation", provider: "none", errorClass: "invalid_input", httpStatus: 400, durationMs: Date.now() - startedAt, candidateCount: 0, requestId }); assistantError(res, requestId, 400, { error: "INVALID_INPUT" }); return; }
  if (!isAssistantRecipeInput({ request, turns: req.body?.turns })) { traceAssistant({ stage: "generation", provider: "none", errorClass: "invalid_input", httpStatus: 413, durationMs: Date.now() - startedAt, candidateCount: 0, requestId }); assistantError(res, requestId, 413, { error: "INPUT_TOO_LARGE" }); return; }
  const controller = new AbortController();
  req.once("aborted", () => controller.abort());
  res.once("close", () => { if (!res.writableEnded) controller.abort(); });
  let draft;
  try {
    draft = await assistantDependencies.generate(request, controller.signal, Array.isArray(req.body?.turns) ? req.body.turns : []);
  } catch {
    if (!controller.signal.aborted) traceAssistant({ stage: "generation", provider: "openai", errorClass: "upstream_unavailable", httpStatus: 503, durationMs: Date.now() - startedAt, candidateCount: 0, requestId });
    if (!controller.signal.aborted) assistantError(res, requestId, 503, { error: "UPSTREAM_UNAVAILABLE" });
    return;
  }
  if (controller.signal.aborted) { traceAssistant({ stage: "generation", provider: "openai", errorClass: "cancelled", durationMs: Date.now() - startedAt, candidateCount: 0, requestId }); return; }
  if (!draft || !validateAssistantRecipeDraft(draft)) { traceAssistant({ stage: "generation", provider: "openai", errorClass: "upstream_unavailable", httpStatus: 503, durationMs: Date.now() - startedAt, candidateCount: 0, requestId }); assistantError(res, requestId, 503, { error: "UPSTREAM_UNAVAILABLE" }); return; }
  traceAssistant({ stage: "generation", provider: "openai", errorClass: "none", httpStatus: 200, durationMs: Date.now() - startedAt, candidateCount: 0, requestId });
  res.setHeader("x-request-id", requestId);
  res.json(draft);
});

/** Voie conseil temporaire, distincte de la génération de recette. */
app.post("/api/assistant/advice", async (req, res) => {
  const requestId = assistantRequestId(req);
  const startedAt = Date.now();
  if (!isChefAdviceRequestV1(req.body)) {
    traceAssistant({ stage: "advice", provider: "none", errorClass: "invalid_input", httpStatus: 400, durationMs: Date.now() - startedAt, candidateCount: 0, requestId });
    assistantError(res, requestId, 400, { error: "INVALID_INPUT" }); return;
  }
  const controller = new AbortController();
  req.once("aborted", () => controller.abort());
  res.once("close", () => { if (!res.writableEnded) controller.abort(); });
  let wire;
  try { wire = await assistantDependencies.advice(req.body, controller.signal); }
  catch {
    traceAssistant({ stage: "advice", provider: "openai", errorClass: controller.signal.aborted ? "cancelled" : "upstream_unavailable", ...(controller.signal.aborted ? {} : { httpStatus: 503 }), durationMs: Date.now() - startedAt, candidateCount: 0, requestId });
    if (!controller.signal.aborted) assistantError(res, requestId, 503, { error: "UPSTREAM_UNAVAILABLE" });
    return;
  }
  if (controller.signal.aborted) { traceAssistant({ stage: "advice", provider: "openai", errorClass: "cancelled", durationMs: Date.now() - startedAt, candidateCount: 0, requestId }); return; }
  if (!wire || !isChefAdviceWireV1(wire)) {
    traceAssistant({ stage: "advice", provider: "openai", errorClass: "upstream_unavailable", httpStatus: 503, durationMs: Date.now() - startedAt, candidateCount: 0, requestId });
    assistantError(res, requestId, 503, { error: "UPSTREAM_UNAVAILABLE" }); return;
  }
  traceAssistant({ stage: "advice", provider: "openai", errorClass: "none", httpStatus: 200, durationMs: Date.now() - startedAt, candidateCount: 0, requestId });
  res.setHeader("x-request-id", requestId);
  res.json(wire);
});

/** Classification sans état, avant tout routage ou écriture côté client. */
app.post("/api/assistant/classify-turn", async (req, res) => {
  const requestId = assistantRequestId(req);
  const startedAt = Date.now();
  if (!isChefTurnClassificationRequestV1(req.body)) {
    traceAssistant({ stage: "classification", provider: "none", errorClass: "invalid_input", httpStatus: 400, durationMs: Date.now() - startedAt, candidateCount: 0, requestId });
    assistantError(res, requestId, 400, { error: "INVALID_INPUT" }); return;
  }
  const controller = new AbortController();
  req.once("aborted", () => controller.abort());
  res.once("close", () => { if (!res.writableEnded) controller.abort(); });
  let wire;
  try { wire = await assistantDependencies.classifyTurn(req.body, controller.signal); }
  catch {
    traceAssistant({ stage: "classification", provider: "openai", errorClass: controller.signal.aborted ? "cancelled" : "upstream_unavailable", ...(controller.signal.aborted ? {} : { httpStatus: 503 }), durationMs: Date.now() - startedAt, candidateCount: 0, requestId });
    if (!controller.signal.aborted) assistantError(res, requestId, 503, { error: "UPSTREAM_UNAVAILABLE" }); return;
  }
  if (controller.signal.aborted) { traceAssistant({ stage: "classification", provider: "openai", errorClass: "cancelled", durationMs: Date.now() - startedAt, candidateCount: 0, requestId }); return; }
  if (!wire || !isChefTurnClassificationWireV1(wire)) {
    traceAssistant({ stage: "classification", provider: "openai", errorClass: "upstream_unavailable", httpStatus: 503, durationMs: Date.now() - startedAt, candidateCount: 0, requestId });
    assistantError(res, requestId, 503, { error: "UPSTREAM_UNAVAILABLE" }); return;
  }
  traceAssistant({ stage: "classification", provider: "openai", errorClass: "none", httpStatus: 200, durationMs: Date.now() - startedAt, candidateCount: 0, requestId });
  res.setHeader("x-request-id", requestId); res.json(wire);
});

app.post("/api/import/url", async (req, res) => {
  const url = req.body?.url as string | undefined;
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  const parsed = await parseRecipeWithCloud({ sourceType: "URL", url });
  res.json(parsed);
});

app.post("/api/import/share", async (req, res) => {
  const text = req.body?.text as string | undefined;
  const url = req.body?.url as string | undefined;
  const title = req.body?.title as string | undefined;

  const parsed = await parseRecipeWithCloud({
    sourceType: "SHARE",
    text,
    url,
    shareTitle: title
  });
  res.json(parsed);
});

app.post("/api/import/text", async (req, res) => {
  const text = req.body?.text as string | undefined;
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const parsed = await parseRecipeWithCloud({ sourceType: "TEXT", text });
  res.json(parsed);
});

/** Pont multipart pur : le contexte d'image reste un champ texte du parseur, jamais un log. */
export function screenshotParseInput(
  file: { buffer: Buffer; mimetype: string },
  contextText: unknown
): ParseRecipeInput {
  return {
    sourceType: "SCREENSHOT",
    text: typeof contextText === "string" ? contextText : undefined,
    screenshotBase64: file.buffer.toString("base64"),
    screenshotMimeType: file.mimetype
  };
}

app.post("/api/import/screenshot", upload.single("file"), async (req, res) => {
  if (!req.file?.buffer) {
    res.status(400).json({ error: "file is required" });
    return;
  }

  const parsed = await parseRecipeWithCloud(screenshotParseInput(req.file, req.body?.contextText));
  res.json(parsed);
});

app.post("/api/import/reorder-steps", async (req, res) => {
  const steps = req.body?.steps as
    | Array<{
        id?: string;
        order?: number;
        text?: string;
        ingredientIds?: string[];
        media?: Array<{ type: string; imageUrl?: string; url?: string }>;
      }>
    | undefined;
  if (!Array.isArray(steps) || steps.length === 0) {
    res.status(400).json({ error: "steps array is required" });
    return;
  }
  const normalized = steps
    .filter((s) => s && typeof s.text === "string" && s.text.trim())
    .map((s) => {
      const rawMedia = Array.isArray(s.media) ? s.media : [];
      const media = rawMedia
        .map((m) => {
          if (!m || typeof m !== "object") return null;
          if (m.type === "image" && typeof m.imageUrl === "string" && m.imageUrl.trim()) {
            return { type: "image" as const, imageUrl: m.imageUrl.trim() };
          }
          if (m.type === "video" && typeof m.url === "string" && m.url.trim()) {
            return { type: "video" as const, url: m.url.trim() };
          }
          return null;
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);
      const ingredientIds = Array.isArray(s.ingredientIds)
        ? (() => {
            const out: string[] = [];
            const seen = new Set<string>();
            for (const id of s.ingredientIds) {
              if (typeof id !== "string") continue;
              const trimmed = id.trim();
              if (!trimmed || seen.has(trimmed)) continue;
              seen.add(trimmed);
              out.push(trimmed);
            }
            return out;
          })()
        : undefined;
      return {
        id: s.id ?? `step-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        order: typeof s.order === "number" ? s.order : 0,
        text: String(s.text).trim(),
        ...(ingredientIds?.length ? { ingredientIds } : {}),
        ...(media.length > 0 ? { media } : {})
      };
    });
  const reordered = await reorderStepsByRecipeLogic(normalized);
  res.json({ steps: reordered });
});

app.post("/api/import/extract-image", async (req, res) => {
  const url = req.body?.url as string | undefined;
  if (!url || !url.startsWith("http")) {
    res.status(400).json({ error: "url is required and must be http(s)" });
    return;
  }
  const imageUrl = await extractImageFromUrl(url);
  if (!imageUrl) {
    res.status(404).json({ error: "No image found on page" });
    return;
  }
  res.json({ imageUrl });
});

app.post("/api/proxy-image", async (req, res) => {
  const url = req.body?.url as string | undefined;
  if (!url || !url.startsWith("http")) {
    res.status(400).json({ error: "url is required and must be http(s)" });
    return;
  }
  try {
    const imgRes = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!imgRes.ok) {
      res.status(502).json({ error: `Upstream fetch failed: ${imgRes.status}` });
      return;
    }
    const blob = await imgRes.blob();
    if (!blob.type.startsWith("image/")) {
      res.status(400).json({ error: "Response is not an image" });
      return;
    }
    res.setHeader("Content-Type", blob.type);
    res.send(Buffer.from(await blob.arrayBuffer()));
  } catch (err) {
    res.status(502).json({ error: (err as Error)?.message ?? "Proxy fetch failed" });
  }
});

app.post("/api/generate-recipe-image", async (req, res) => {
  const title = req.body?.title as string | undefined;
  const ingredients = req.body?.ingredients as Array<{ label?: string }> | undefined;
  const steps = req.body?.steps as Array<{ text?: string }> | undefined;

  if (!title?.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const input = {
    title: title.trim(),
    ingredients: Array.isArray(ingredients)
      ? ingredients.map((i) => ({ label: String(i?.label ?? "").trim() }))
      : [],
    steps: Array.isArray(steps)
      ? steps.map((s) => ({ text: String(s?.text ?? "").trim() }))
      : []
  };

  const imageOpts = { model: getImageModel("recipe"), quality: getImageQuality("recipe") };
  const cacheKey = buildRecipeImageCacheKey(input, imageOpts);
  const imageUrl = await resolveCachedImageUrl(cacheKey, req, () => generateRecipeImage(input));

  if (!imageUrl) {
    res.status(503).json({ error: "Image generation unavailable" });
    return;
  }

  res.json({ imageUrl });
});

/** Clé de cache uniquement (pas d’appel IA) — pour archives export légères. */
app.post("/api/generated-images/cache-key/recipe-image", (req, res) => {
  const title = req.body?.title as string | undefined;
  const ingredients = req.body?.ingredients as Array<{ label?: string }> | undefined;
  const steps = req.body?.steps as Array<{ text?: string }> | undefined;

  if (!title?.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const input = {
    title: title.trim(),
    ingredients: Array.isArray(ingredients)
      ? ingredients.map((i) => ({ label: String(i?.label ?? "").trim() }))
      : [],
    steps: Array.isArray(steps)
      ? steps.map((s) => ({ text: String(s?.text ?? "").trim() }))
      : []
  };

  const imageOpts = { model: getImageModel("recipe"), quality: getImageQuality("recipe") };
  const key = buildRecipeImageCacheKey(input, imageOpts);
  res.json({ key });
});

app.post("/api/generated-images/cache-key/cooking-step-image", (req, res) => {
  const stepText = req.body?.stepText as string | undefined;
  if (!stepText?.trim()) {
    res.status(400).json({ error: "stepText is required" });
    return;
  }

  const input = { stepText: stepText.trim() };
  const imageOpts = { model: getImageModel("cooking_step"), quality: getImageQuality("cooking_step") };
  const key = buildCookingStepImageCacheKey(input, imageOpts);
  res.json({ key });
});

app.post("/api/generated-images/cache-key/ingredient-image", (req, res) => {
  const label = req.body?.label as string | undefined;
  if (!label?.trim()) {
    res.status(400).json({ error: "label is required" });
    return;
  }

  const input = { label: label.trim() };
  const imageOpts = { model: getImageModel("ingredient"), quality: getImageQuality("ingredient") };
  const key = buildIngredientImageCacheKey(input, imageOpts);
  res.json({ key });
});

app.post("/api/generate-ingredient-image", async (req, res) => {
  const label = req.body?.label as string | undefined;
  if (!label?.trim()) {
    res.status(400).json({ error: "label is required" });
    return;
  }

  const input = { label: label.trim() };
  const imageOpts = { model: getImageModel("ingredient"), quality: getImageQuality("ingredient") };
  const cacheKey = buildIngredientImageCacheKey(input, imageOpts);
  const imageUrl = await resolveCachedImageUrl(cacheKey, req, () =>
    generateIngredientImage(input)
  );
  if (!imageUrl) {
    res.status(503).json({ error: "Ingredient image generation unavailable" });
    return;
  }

  res.json({ imageUrl });
});

app.post("/api/generate-cooking-step-image", async (req, res) => {
  const stepText = req.body?.stepText as string | undefined;
  if (!stepText?.trim()) {
    res.status(400).json({ error: "stepText is required" });
    return;
  }

  const input = { stepText: stepText.trim() };
  const imageOpts = { model: getImageModel("cooking_step"), quality: getImageQuality("cooking_step") };
  const cacheKey = buildCookingStepImageCacheKey(input, imageOpts);
  const imageUrl = await resolveCachedImageUrl(cacheKey, req, () =>
    generateCookingStepImage(input)
  );
  if (!imageUrl) {
    res.status(503).json({ error: "Cooking step image generation unavailable" });
    return;
  }

  res.json({ imageUrl });
});

app.get("/api/generated-images/:key", async (req, res) => {
  const key = String(req.params.key ?? "").trim();
  if (!key) {
    res.status(400).json({ error: "key is required" });
    return;
  }

  const cachedImage = await getCachedImageByKey(key);
  if (!cachedImage) {
    res.status(404).json({ error: "Cached image not found" });
    return;
  }

  res.setHeader("Content-Type", cachedImage.mimeType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(cachedImage.buffer);
});

app.post("/api/admin/generated-images/purge-key", async (req, res) => {
  if (!isGeneratedImageAdminAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const key = String(req.body?.key ?? "").trim();
  if (!key) {
    res.status(400).json({ error: "key is required" });
    return;
  }

  const deleted = await deleteCachedImageByKey(key);
  res.json({ key, deleted });
});

app.post("/api/admin/generated-images/purge-ingredient", async (req, res) => {
  if (!isGeneratedImageAdminAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const label = String(req.body?.label ?? "").trim();
  if (!label) {
    res.status(400).json({ error: "label is required" });
    return;
  }

  const imageOpts = { model: getImageModel("ingredient"), quality: getImageQuality("ingredient") };
  const key = buildIngredientImageCacheKey({ label }, imageOpts);
  const deleted = await deleteCachedImageByKey(key);
  res.json({ key, label, deleted });
});

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`BFF listening on http://localhost:${port} (CORS: ${corsOrigin})`);
    // eslint-disable-next-line no-console
    console.log(
      `  .env: ${envResult.error ? `NOT FOUND (${envPath})` : envPath} | OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "set" : "NOT SET"}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `  generated image storage: ${describeGeneratedImageStorage()} | admin purge: ${generatedImageAdminToken ? "enabled" : "disabled"}`
    );
  });
}
