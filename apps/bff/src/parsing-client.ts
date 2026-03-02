import * as cheerio from "cheerio";
import OpenAI from "openai";
import { instagramGetUrl, type InstagramResponse } from "instagram-url-direct";
import { extractYouTubeVideoId, isYouTubeUrl } from "./youtube-utils.js";
import type { IngredientLine, ImportType, ParsedRecipeDraft } from "./types.js";

export interface ParseRecipeInput {
  sourceType: ImportType;
  text?: string;
  url?: string;
  screenshotBase64?: string;
  screenshotMimeType?: string;
  shareTitle?: string;
}

function fallbackDraft(
  title: string,
  sourceType: ImportType,
  url?: string,
  options?: {
    imageUrl?: string;
  }
): ParsedRecipeDraft {
  const ingredients: IngredientLine[] = [];
  return {
    title,
    category: "SALE",
    ingredients,
    steps: [],
    imageUrl: options?.imageUrl,
    source: {
      type: sourceType,
      url,
      capturedAt: new Date().toISOString()
    }
  };
}

function parseIso8601DurationToMinutes(value: string | undefined): number | undefined {
  if (!value || typeof value !== "string") return undefined;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return undefined;
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const seconds = parseInt(match[3] ?? "0", 10);
  return hours * 60 + minutes + Math.round(seconds / 60);
}

function parseServings(value: unknown): number | undefined {
  if (typeof value === "number" && value > 0) return value;
  if (typeof value === "string") {
    const m = value.match(/(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  return undefined;
}

const UNIT_PATTERN =
  /(?:litres?|g(?:r?)?|kg|ml|cl|L|cuillère[s]?\s+à\s+soupe|cuillère[s]?\s+à\s+café|c\.?\s*à\s*s\.?|c\.?\s*à\s*c\.?|cc|cs|CC|pincée|œuf|oeuf|oeufs|œufs|unité|unités|pièce|pièces|tranche|tranches|feuille|feuilles)/i;

const QTY_PATTERN = /(\d*\/\d+|\d+(?:[.,]\d+)?|demi|½|⅓|⅔|¼|¾)/;

function parseQuantity(value: string): number | undefined {
  const v = value.trim().toLowerCase();
  const wordFractions: Record<string, number> = {
    demi: 0.5,
    "½": 0.5,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
    "¼": 0.25,
    "¾": 0.75
  };
  if (v in wordFractions) return wordFractions[v];
  const fracMatch = v.match(/^(\d*)\/(\d+)$/);
  if (fracMatch) {
    const num = fracMatch[1] ? parseInt(fracMatch[1], 10) : 1;
    const den = parseInt(fracMatch[2], 10);
    return den ? num / den : undefined;
  }
  const n = parseFloat(v.replace(",", "."));
  return Number.isNaN(n) ? undefined : n;
}

function normalizeUnit(raw: string): string {
  const u = raw.replace(/\.+$/, "").trim().toLowerCase();
  if (/^gr?$/.test(u)) return "g";
  if (
    /^cc$/i.test(u) ||
    /^c\.?\s*à\s*c\.?$/.test(u) ||
    u === "cuillère à café" ||
    u === "cuillères à café"
  )
    return "c. à c.";
  if (/^c\.?\s*à\s*s\.?$/.test(u) || u === "cuillère à soupe" || u === "cuillères à soupe")
    return "c. à s.";
  return raw.replace(/\.+$/, "").trim();
}

function parseIngredientFromRaw(raw: string, id: string): IngredientLine {
  const trimmed = raw.trim();

  // Format "label : quantity unit" (ex: "philadelphia ou ricotta : 35 gr", "huile : 1/2 CC")
  const labelFirstMatch = trimmed.match(
    new RegExp(`^(.+?)\\s*:\\s*${QTY_PATTERN.source}\\s*(${UNIT_PATTERN.source})\\s*$`, "i")
  );
  if (labelFirstMatch) {
    const label = labelFirstMatch[1].trim();
    const qty = parseQuantity(labelFirstMatch[2]);
    const rawUnit = labelFirstMatch[3]?.trim();
    if (qty !== undefined && rawUnit) {
      const unit = normalizeUnit(rawUnit);
      const isScalable =
        !/pincée|sel|poivre|à volonté/i.test(unit + label);
      return {
        id,
        label,
        quantity: qty,
        unit,
        isScalable: Boolean(isScalable)
      };
    }
  }

  // Format "quantity unit label" (ex: "35 g philadelphia", "1/2 cc huile")
  const qtyFirstMatch = trimmed.match(
    new RegExp(`^${QTY_PATTERN.source}\\s*(${UNIT_PATTERN.source})?\\s*(?:de\\s+)?(.+)$`, "i")
  );
  if (qtyFirstMatch) {
    const qty = parseQuantity(qtyFirstMatch[1]);
    const rawUnit = qtyFirstMatch[2]?.trim();
    const label = qtyFirstMatch[3]?.trim() || trimmed;
    if (qty !== undefined) {
      const unit = rawUnit ? normalizeUnit(rawUnit) : undefined;
      const isScalable =
        unit !== undefined &&
        !/pincée|sel|poivre|à volonté/i.test(unit + label);
      return {
        id,
        label,
        quantity: qty,
        unit,
        isScalable: Boolean(isScalable)
      };
    }
  }

  return {
    id,
    label: trimmed,
    isScalable: false
  };
}

interface SchemaRecipe {
  "@type"?: string;
  name?: string;
  image?: string | string[] | { url?: string } | Array<{ url?: string }>;
  recipeIngredient?: string[];
  recipeInstructions?: unknown;
  recipeYield?: unknown;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\""
};

function decodeCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return fallback;
  }
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (full, hex) =>
      decodeCodePoint(Number.parseInt(hex, 16), full)
    )
    .replace(/&#(\d+);/g, (full, decimal) =>
      decodeCodePoint(Number.parseInt(decimal, 10), full)
    )
    .replace(/&([a-z]+);/gi, (full, name) => HTML_ENTITY_MAP[name.toLowerCase()] ?? full);
}

function normalizeInstructionText(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function extractInstructionTexts(rawInstruction: unknown): string[] {
  if (typeof rawInstruction === "string") {
    const normalized = normalizeInstructionText(rawInstruction);
    return normalized ? [normalized] : [];
  }
  if (Array.isArray(rawInstruction)) {
    return rawInstruction.flatMap((entry) => extractInstructionTexts(entry));
  }
  if (!rawInstruction || typeof rawInstruction !== "object") {
    return [];
  }

  const instructionNode = rawInstruction as Record<string, unknown>;
  const nestedInstructionEntries = [instructionNode.itemListElement, instructionNode.item]
    .flatMap((entry) => extractInstructionTexts(entry));
  if (nestedInstructionEntries.length > 0) {
    return nestedInstructionEntries;
  }

  const directText = [instructionNode.text, instructionNode.name, instructionNode.description].find(
    (candidate) => typeof candidate === "string"
  ) as string | undefined;
  if (!directText) {
    return [];
  }
  const normalized = normalizeInstructionText(directText);
  return normalized ? [normalized] : [];
}

function extractImageUrl(image: SchemaRecipe["image"]): string | undefined {
  if (!image) return undefined;
  if (typeof image === "string") return image;
  if (Array.isArray(image)) {
    const first = image[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "url" in first) return first.url;
    return undefined;
  }
  if (typeof image === "object" && image !== null && "url" in image) {
    return (image as { url?: string }).url;
  }
  return undefined;
}

function extractRecipeFromJsonLd(html: string, baseUrl: string): ParsedRecipeDraft | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const content = $(scripts[i]).html();
    if (!content) continue;
    try {
      const data = JSON.parse(content) as SchemaRecipe | { "@graph"?: SchemaRecipe[] };
      const items: SchemaRecipe[] = Array.isArray(data)
        ? data
        : "@graph" in data && Array.isArray(data["@graph"])
          ? data["@graph"]
          : [data as SchemaRecipe];

      for (const item of items) {
        const type = item["@type"];
        if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
          const name = item.name;
          if (!name) continue;

          const ingredients: IngredientLine[] = (item.recipeIngredient ?? []).map(
            (raw, idx) =>
              parseIngredientFromRaw(String(raw), `ing-${idx}-${Date.now()}`)
          );

          const rawSteps = item.recipeInstructions;
          const steps = extractInstructionTexts(rawSteps).map((text, idx) => ({
            id: `step-${idx}-${Date.now()}`,
            order: idx + 1,
            text
          }));

          const imageUrl = extractImageUrl(item.image);
          const resolvedImage =
            imageUrl && imageUrl.startsWith("http")
              ? imageUrl
              : imageUrl
                ? new URL(imageUrl, baseUrl).href
                : undefined;

          return {
            title: String(name).trim(),
            category: "SALE",
            servingsBase: parseServings(item.recipeYield),
            ingredients,
            steps: steps.filter((s) => s.text),
            prepTimeMin: parseIso8601DurationToMinutes(item.prepTime),
            cookTimeMin: parseIso8601DurationToMinutes(item.cookTime),
            imageUrl: resolvedImage,
            source: {
              type: "URL",
              url: baseUrl,
              capturedAt: new Date().toISOString()
            }
          };
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }
  return null;
}

function extractOgImage(html: string, baseUrl: string): string | undefined {
  const $ = cheerio.load(html);
  const og = $('meta[property="og:image"]').attr("content");
  if (og && og.startsWith("http")) return og;
  if (og) return new URL(og, baseUrl).href;
  return undefined;
}

/** Extrait une URL TwicPics (CDN avec CORS) depuis srcset/src si l'image JSON-LD vient d'un domaine sans CORS (ex. sebplatform). */
function extractTwicPicsImage(
  html: string,
  jsonLdImageUrl: string | undefined
): string | undefined {
  if (!jsonLdImageUrl) return undefined;
  const match = jsonLdImageUrl.match(/\/([a-f0-9-]+\.(?:jpg|jpeg|png|webp))(?:\?|$)/i);
  if (!match) return undefined;
  const filename = match[1];
  const twicMatch = html.match(
    new RegExp(
      `(https://twicpics\\.[^/]+/https?://[^"\\s]*${filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"\\s]*)`,
      "i"
    )
  );
  if (twicMatch) {
    return twicMatch[1].replace(/&amp;/g, "&");
  }
  return undefined;
}

function extractMainText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, aside, .ad, .ads").remove();
  const main =
    $("main").text() ||
    $('article[role="main"]').text() ||
    $(".recipe-content, .recipe-body, .recette, [itemtype*=\"Recipe\"]").text() ||
    $("body").text();
  return main.replace(/\s+/g, " ").trim().slice(0, 15000);
}

function isInstagramUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "instagram.com" ||
      host === "www.instagram.com" ||
      host === "m.instagram.com" ||
      host === "instagr.am"
    );
  } catch {
    return false;
  }
}

interface YouTubeOEmbedResponse {
  title?: string;
  thumbnail_url?: string;
}

async function extractYouTubeData(url: string): Promise<{
  title: string;
  imageUrl?: string;
  descriptionText: string;
}> {
  const videoId = extractYouTubeVideoId(url);
  const canonicalUrl =
    videoId && url.includes("youtube.com")
      ? `https://www.youtube.com/watch?v=${videoId}`
      : url;

  let title = "Recette YouTube";
  let imageUrl: string | undefined;
  let descriptionText = "";

  try {
    const oEmbedRes = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CookiesEtCoquillettes/1.0; +https://github.com/cookies-et-coquilettes)"
        },
        signal: AbortSignal.timeout(10000)
      }
    );
    if (oEmbedRes.ok) {
      const oembed = (await oEmbedRes.json()) as YouTubeOEmbedResponse;
      if (oembed.title) title = oembed.title;
      if (oembed.thumbnail_url?.startsWith("http")) imageUrl = oembed.thumbnail_url;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("YouTube oEmbed error", err);
  }

  try {
    const html = await fetchUrl(canonicalUrl);
    const $ = cheerio.load(html);
    const ogDesc = $('meta[property="og:description"]').attr("content");
    if (ogDesc?.trim()) {
      descriptionText = decodeHtmlEntities(ogDesc).replace(/\s+/g, " ").trim();
    }
    if (!imageUrl) {
      const ogImage = $('meta[property="og:image"]').attr("content");
      if (ogImage?.startsWith("http")) imageUrl = ogImage;
    }
    const shortDescMatch = html.match(
      /"shortDescription"\s*:\s*"((?:[^"\\]|\\.)*)"/
    );
    if (shortDescMatch?.[1]) {
      const unescaped = shortDescMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
      const fullDesc = decodeHtmlEntities(unescaped).replace(/\s+/g, " ").trim();
      if (fullDesc.length > descriptionText.length) {
        descriptionText = fullDesc;
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("YouTube HTML fetch error", err);
  }

  return { title, imageUrl, descriptionText };
}

function pickInstagramImage(result: InstagramResponse): string | undefined {
  const imageMedia = result.media_details.find((media) => media.type === "image" && media.url);
  if (imageMedia?.url) {
    return imageMedia.url;
  }
  const thumbnailMedia = result.media_details.find((media) => media.thumbnail);
  if (thumbnailMedia?.thumbnail) {
    return thumbnailMedia.thumbnail;
  }
  return result.url_list.find((candidate) => candidate.startsWith("http"));
}

function buildInstagramFallbackTitle(result: InstagramResponse): string {
  const username = result.post_info?.owner_username?.trim();
  return username ? `Recette Instagram @${username}` : "Recette Instagram";
}

function buildInstagramPromptText(result: InstagramResponse): string {
  const caption = result.post_info?.caption?.trim();
  const username = result.post_info?.owner_username?.trim();
  if (!caption) {
    return "";
  }
  const contextualizedCaption = username
    ? `Publication Instagram de @${username}\n\n${caption}`
    : caption;
  return contextualizedCaption.slice(0, 12000);
}

function sanitizeInstagramCaption(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/\s+/g, " ")
    .replace(/^[^:]+on Instagram:\s*/i, "")
    .replace(/^\d+\s+likes?,\s*\d+\s+comments?\s*-\s*[^:]+:\s*/i, "")
    .trim();
}

function extractInstagramUsernameFromOgDescription(ogDescription: string): string | undefined {
  const match = ogDescription.match(/\s-\s([a-z0-9._]+)\s+on\s+/i);
  return match?.[1]?.trim();
}

interface LlmRecipePayload {
  title?: string;
  category?: string;
  servingsBase?: number;
  prepTimeMin?: number;
  cookTimeMin?: number;
  ingredients?: Array<{
    label?: string;
    quantity?: number;
    unit?: string;
    isScalable?: boolean;
  }>;
  steps?: Array<{ order?: number; text?: string }>;
}

function parseLlmRecipePayload(raw: string): LlmRecipePayload | null {
  let json = raw.replace(/^```json?\s*|\s*```$/g, "").trim();
  // Fix trailing commas (invalid JSON but common in LLM output)
  json = json.replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(json) as LlmRecipePayload;
  } catch {
    return null;
  }
}

function toDraftFromLlmPayload(
  parsed: LlmRecipePayload,
  sourceType: ImportType,
  url?: string,
  imageUrl?: string
): ParsedRecipeDraft {
  const title = parsed.title?.trim() || "Recette importée";
  const category = parsed.category === "SUCRE" ? "SUCRE" : "SALE";
  const ingredients: IngredientLine[] = (parsed.ingredients ?? []).map((ing, idx) => ({
    id: `ing-${idx}-${Date.now()}`,
    label: String(ing.label ?? "").trim(),
    quantity: typeof ing.quantity === "number" ? ing.quantity : undefined,
    unit: ing.unit?.trim() || undefined,
    isScalable: Boolean(ing.isScalable)
  }));
  const steps = [...(parsed.steps ?? [])]
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
    .map((s, idx) => ({
      id: `step-${idx}-${Date.now()}`,
      order: idx + 1,
      text: String(s.text ?? "").trim()
    }))
    .filter((s) => s.text);

  return {
    title,
    category,
    servingsBase: typeof parsed.servingsBase === "number" ? parsed.servingsBase : undefined,
    ingredients,
    steps,
    prepTimeMin: typeof parsed.prepTimeMin === "number" ? parsed.prepTimeMin : undefined,
    cookTimeMin: typeof parsed.cookTimeMin === "number" ? parsed.cookTimeMin : undefined,
    imageUrl: imageUrl || undefined,
    source: {
      type: sourceType,
      url: url?.trim() || undefined,
      capturedAt: new Date().toISOString()
    }
  };
}

function withSourceType(
  draft: ParsedRecipeDraft,
  sourceType: ImportType,
  url?: string
): ParsedRecipeDraft {
  return {
    ...draft,
    source: {
      type: sourceType,
      url: url?.trim() || undefined,
      capturedAt: draft.source?.capturedAt ?? new Date().toISOString()
    }
  };
}

async function parseWithOpenAI(
  text: string,
  imageUrl: string | undefined,
  url: string | undefined,
  sourceType: ImportType,
  fallbackTitle = "Recette importée"
): Promise<ParsedRecipeDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackDraft(fallbackTitle, sourceType, url, { imageUrl });
  }

  const client = new OpenAI({ apiKey });
  const prompt = `Tu es un assistant qui extrait des recettes de cuisine à partir de texte.
Extrais les champs suivants au format JSON (réponds uniquement avec du JSON valide, sans markdown) :
{
  "title": "titre de la recette",
  "category": "SUCRE" ou "SALE",
  "servingsBase": nombre de portions (nombre ou null),
  "prepTimeMin": temps préparation en minutes (nombre ou null),
  "cookTimeMin": temps cuisson en minutes (nombre ou null),
  "ingredients": [{"label": "nom", "quantity": nombre ou null, "unit": "unité", "isScalable": true/false}],
  "steps": [{"order": 1, "text": "description étape"}]
}
Pour les ingrédients : quantity et unit optionnels. Reconnaître : g/gr (grammes), CC/c à c (cuillère à café), c à s (cuillère à soupe), fractions (1/2 = demi). isScalable=true si la quantité peut être ajustée (ex: farine), false pour "sel", "poivre", "à volonté".
Pour les étapes : extraire toute préparation ou instructions présentes (même partielles). Si le texte ne contient que des ingrédients, mettre steps: [].
Texte à analyser :

${text.slice(0, 12000)}`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return fallbackDraft(fallbackTitle, sourceType, url, { imageUrl });
    const parsed = parseLlmRecipePayload(raw);
    if (!parsed) return fallbackDraft(fallbackTitle, sourceType, url, { imageUrl });
    return toDraftFromLlmPayload(parsed, sourceType, url, imageUrl);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("OpenAI parse error", err);
    return fallbackDraft(fallbackTitle, sourceType, url, { imageUrl });
  }
}

async function parseScreenshotWithOpenAI(
  screenshotBase64: string,
  sourceType: ImportType,
  url?: string,
  screenshotMimeType?: string
): Promise<ParsedRecipeDraft> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackDraft("Recette depuis capture", sourceType, url);
  }

  const client = new OpenAI({ apiKey });
  const mimeType =
    screenshotMimeType && screenshotMimeType.startsWith("image/")
      ? screenshotMimeType
      : "image/jpeg";
  const prompt = `Tu es un assistant qui extrait une recette de cuisine depuis une photo/screenshot.
Réponds uniquement avec du JSON valide, sans markdown :
{
  "title": "titre de la recette",
  "category": "SUCRE" ou "SALE",
  "servingsBase": nombre de portions (nombre ou null),
  "prepTimeMin": temps préparation en minutes (nombre ou null),
  "cookTimeMin": temps cuisson en minutes (nombre ou null),
  "ingredients": [{"label": "nom", "quantity": nombre ou null, "unit": "unité", "isScalable": true/false}],
  "steps": [{"order": 1, "text": "description étape"}]
}
Règles :
- Extraire uniquement ce qui est lisible sur l'image.
- Si une valeur n'est pas lisible, mettre null (ou [] pour listes).
- Conserver les ingrédients en français quand possible.
- Ordonner les étapes dans l'ordre de lecture de la recette.`;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${screenshotBase64}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      temperature: 0.1
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return fallbackDraft("Recette depuis capture", sourceType, url);
    const parsed = parseLlmRecipePayload(raw);
    if (!parsed) return fallbackDraft("Recette depuis capture", sourceType, url);
    return toDraftFromLlmPayload(parsed, sourceType, url);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("OpenAI screenshot parse error", err);
    return fallbackDraft("Recette depuis capture", sourceType, url);
  }
}

async function fetchUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; CookiesEtCoquillettes/1.0; +https://github.com/cookies-et-coquilettes)"
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.text();
}

async function extractInstagramData(url: string): Promise<{
  captionText: string;
  imageUrl?: string;
  fallbackTitle: string;
}> {
  const instagramData = await instagramGetUrl(url, { retries: 2, delay: 600 });
  return {
    captionText: buildInstagramPromptText(instagramData),
    imageUrl: pickInstagramImage(instagramData),
    fallbackTitle: buildInstagramFallbackTitle(instagramData)
  };
}

async function extractInstagramFallbackDataFromHtml(url: string): Promise<{
  captionText: string;
  imageUrl?: string;
  fallbackTitle: string;
} | null> {
  const html = await fetchUrl(url);
  const $ = cheerio.load(html);
  const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
  const ogDescription = $('meta[property="og:description"]').attr("content") ?? "";
  const ogImage = $('meta[property="og:image"]').attr("content");

  const captionFromTitle = sanitizeInstagramCaption(ogTitle);
  const captionFromDescription = sanitizeInstagramCaption(ogDescription);
  const captionText = captionFromTitle || captionFromDescription;

  const username = extractInstagramUsernameFromOgDescription(ogDescription);
  const fallbackTitle = username ? `Recette Instagram @${username}` : "Recette Instagram";
  const imageUrl = ogImage?.startsWith("http") ? ogImage : undefined;

  if (!captionText && !imageUrl) {
    return null;
  }

  return {
    captionText,
    imageUrl,
    fallbackTitle
  };
}

/** Extrait uniquement l'URL de l'image depuis une page (og:image, JSON-LD, TwicPics). */
export async function extractImageFromUrl(url: string): Promise<string | undefined> {
  if (isInstagramUrl(url)) {
    try {
      const instagramData = await extractInstagramData(url);
      return instagramData.imageUrl;
    } catch {
      // Fallback sur extraction HTML standard si le scraper Instagram échoue
    }
  }

  if (isYouTubeUrl(url)) {
    try {
      const ytData = await extractYouTubeData(url);
      return ytData.imageUrl;
    } catch {
      // Fallback sur extraction HTML standard
    }
  }

  try {
    const html = await fetchUrl(url);
    const ogImage = extractOgImage(html, url);
    if (ogImage) return ogImage;
    const jsonLdDraft = extractRecipeFromJsonLd(html, url);
    if (jsonLdDraft?.imageUrl) {
      const twicImage = extractTwicPicsImage(html, jsonLdDraft.imageUrl);
      return twicImage ?? jsonLdDraft.imageUrl;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function parseRecipeWithCloud(
  input: ParseRecipeInput
): Promise<ParsedRecipeDraft> {
  const sourceType = input.sourceType;
  const url = input.url;

  if (sourceType === "URL" && url) {
    if (isInstagramUrl(url)) {
      try {
        const instagramData = await extractInstagramData(url);
        if (instagramData.captionText.length > 30) {
          return parseWithOpenAI(
            instagramData.captionText,
            instagramData.imageUrl,
            url,
            sourceType,
            instagramData.fallbackTitle
          );
        }
        return fallbackDraft(instagramData.fallbackTitle, sourceType, url, {
          imageUrl: instagramData.imageUrl
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Instagram import error", err);
      }

      try {
        const fallbackData = await extractInstagramFallbackDataFromHtml(url);
        if (fallbackData) {
          if (fallbackData.captionText.length > 30) {
            return parseWithOpenAI(
              fallbackData.captionText,
              fallbackData.imageUrl,
              url,
              sourceType,
              fallbackData.fallbackTitle
            );
          }
          return fallbackDraft(fallbackData.fallbackTitle, sourceType, url, {
            imageUrl: fallbackData.imageUrl
          });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Instagram metadata fallback error", err);
      }
    }

    if (isYouTubeUrl(url)) {
      try {
        const ytData = await extractYouTubeData(url);
        if (ytData.descriptionText.length > 80) {
          return parseWithOpenAI(
            ytData.descriptionText,
            ytData.imageUrl,
            url,
            sourceType,
            ytData.title
          );
        }
        return fallbackDraft(ytData.title, sourceType, url, {
          imageUrl: ytData.imageUrl
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("YouTube import error", err);
      }
    }

    try {
      const html = await fetchUrl(url);
      const baseUrl = url;

      const jsonLdDraft = extractRecipeFromJsonLd(html, baseUrl);
      const ogImage = extractOgImage(html, baseUrl);

      if (jsonLdDraft && jsonLdDraft.ingredients.length + jsonLdDraft.steps.length > 0) {
        // Préférer og:image ou TwicPics (CDN avec CORS) pour éviter blocage affichage
        const twicImage = extractTwicPicsImage(html, jsonLdDraft.imageUrl);
        if (ogImage) {
          jsonLdDraft.imageUrl = ogImage;
        } else if (twicImage) {
          jsonLdDraft.imageUrl = twicImage;
        }
        return jsonLdDraft;
      }

      const text = extractMainText(html);
      if (text.length > 100) {
        return parseWithOpenAI(text, ogImage, url, sourceType, "Recette depuis URL");
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("URL import error", err);
    }
    return fallbackDraft("Recette depuis URL", sourceType, url);
  }

  if (sourceType === "TEXT" && input.text) {
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
    if (hasOpenAiKey) {
      return parseWithOpenAI(
        input.text,
        undefined,
        url,
        sourceType,
        "Recette depuis texte"
      );
    }
    return fallbackDraft("Recette depuis texte", sourceType, url);
  }

  if (sourceType === "SHARE") {
    if (url && isYouTubeUrl(url)) {
      try {
        const ytData = await extractYouTubeData(url);
        const text = [input.shareTitle, input.text, ytData.descriptionText]
          .filter((chunk): chunk is string => Boolean(chunk?.trim()))
          .join("\n\n");
        if (text.length > 80) {
          return parseWithOpenAI(
            text,
            ytData.imageUrl,
            url,
            sourceType,
            ytData.title
          );
        }
        return fallbackDraft(ytData.title, sourceType, url, {
          imageUrl: ytData.imageUrl
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("YouTube SHARE import error", err);
      }
    }

    if (url) {
      try {
        const html = await fetchUrl(url);
        const jsonLdDraft = extractRecipeFromJsonLd(html, url);
        const ogImage = extractOgImage(html, url);

        if (jsonLdDraft && jsonLdDraft.ingredients.length + jsonLdDraft.steps.length > 0) {
          const twicImage = extractTwicPicsImage(html, jsonLdDraft.imageUrl);
          if (ogImage) {
            jsonLdDraft.imageUrl = ogImage;
          } else if (twicImage) {
            jsonLdDraft.imageUrl = twicImage;
          }
          return withSourceType(jsonLdDraft, sourceType, url);
        }

        const mergedText = [input.shareTitle, input.text, extractMainText(html)]
          .filter((chunk): chunk is string => Boolean(chunk?.trim()))
          .join("\n\n");
        const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
        if (hasOpenAiKey && mergedText.length > 100) {
          return parseWithOpenAI(mergedText, ogImage, url, sourceType);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("SHARE import URL extraction error", err);
      }
    }

    const text = input.text ?? input.shareTitle ?? "";
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
    if (hasOpenAiKey && text.length > 50) {
      return parseWithOpenAI(
        text,
        undefined,
        url,
        sourceType,
        input.shareTitle?.trim() || "Recette partagée"
      );
    }
    return fallbackDraft(input.shareTitle ?? "Recette partagée", sourceType, url);
  }

  if (sourceType === "SCREENSHOT" && input.screenshotBase64) {
    return parseScreenshotWithOpenAI(
      input.screenshotBase64,
      sourceType,
      url,
      input.screenshotMimeType
    );
  }

  return fallbackDraft("Recette importée", sourceType, url);
}
