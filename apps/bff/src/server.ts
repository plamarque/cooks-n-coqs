import { envPath, envResult } from "./load-env.js";
import cors from "cors";
import express from "express";
import multer from "multer";
import {
  extractImageFromUrl,
  parseRecipeWithCloud,
  reorderStepsByRecipeLogic
} from "./parsing-client.js";
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

const app = express();
const upload = multer();
const port = Number(process.env.PORT ?? 8787);
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
const generatedImageAdminToken = process.env.GENERATED_IMAGE_ADMIN_TOKEN?.trim();

app.use(
  cors({
    origin: corsOrigin === "*" ? true : corsOrigin
  })
);
app.use(express.json({ limit: "4mb" }));

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

app.post("/api/import/screenshot", upload.single("file"), async (req, res) => {
  if (!req.file?.buffer) {
    res.status(400).json({ error: "file is required" });
    return;
  }

  const screenshotBase64 = req.file.buffer.toString("base64");
  const parsed = await parseRecipeWithCloud({
    sourceType: "SCREENSHOT",
    screenshotBase64,
    screenshotMimeType: req.file.mimetype
  });
  res.json(parsed);
});

app.post("/api/import/reorder-steps", async (req, res) => {
  const steps = req.body?.steps as Array<{ id?: string; order?: number; text?: string }> | undefined;
  if (!Array.isArray(steps) || steps.length === 0) {
    res.status(400).json({ error: "steps array is required" });
    return;
  }
  const normalized = steps
    .filter((s) => s && typeof s.text === "string" && s.text.trim())
    .map((s) => ({
      id: s.id ?? `step-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      order: typeof s.order === "number" ? s.order : 0,
      text: String(s.text).trim()
    }));
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
