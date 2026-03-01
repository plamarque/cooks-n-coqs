import * as path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import cors from "cors";
import express from "express";
import multer from "multer";
import { extractImageFromUrl, parseRecipeWithCloud } from "./parsing-client.js";
import {
  generateCookingStepImage,
  generateIngredientImage,
  generateRecipeImage
} from "./image-generator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPathFromDir = path.resolve(__dirname, "..", "..", "..", ".env");
const envPathFromCwd = path.resolve(process.cwd(), ".env");
let envResult = config({ path: envPathFromDir });
let envPath = envPathFromDir;
if (envResult.error) {
  envPath = envPathFromCwd;
  envResult = config({ path: envPathFromCwd });
}

const app = express();
const upload = multer();
const port = Number(process.env.PORT ?? 8787);
const corsOrigin = process.env.CORS_ORIGIN ?? "*";

app.use(
  cors({
    origin: corsOrigin === "*" ? true : corsOrigin
  })
);
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
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

  const imageUrl = await generateRecipeImage({
    title: title.trim(),
    ingredients: Array.isArray(ingredients)
      ? ingredients.map((i) => ({ label: String(i?.label ?? "").trim() }))
      : [],
    steps: Array.isArray(steps)
      ? steps.map((s) => ({ text: String(s?.text ?? "").trim() }))
      : []
  });

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

  const imageUrl = await generateIngredientImage({ label: label.trim() });
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

  const imageUrl = await generateCookingStepImage({ stepText: stepText.trim() });
  if (!imageUrl) {
    res.status(503).json({ error: "Cooking step image generation unavailable" });
    return;
  }

  res.json({ imageUrl });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`BFF listening on http://localhost:${port} (CORS: ${corsOrigin})`);
  // eslint-disable-next-line no-console
  console.log(
    `  .env: ${envResult.error ? `NOT FOUND (${envPath})` : envPath} | OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "set" : "NOT SET"}`
  );
});
