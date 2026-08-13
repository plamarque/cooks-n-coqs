import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import OpenAI from "openai";
import { getChatModel } from "./ai-config.js";
import { instagramGetUrl, type InstagramResponse } from "instagram-url-direct";
import { extractYouTubeVideoId, isYouTubeUrl } from "./youtube-utils.js";
import type {
  IngredientLine,
  ImportType,
  ParsedInstructionStep,
  ParsedRecipeDraft,
  RecipeCategory,
  StepMediumDraft
} from "./types.js";

export interface ParseRecipeInput {
  sourceType: ImportType;
  text?: string;
  url?: string;
  screenshotBase64?: string;
  screenshotMimeType?: string;
  shareTitle?: string;
  /** Injection tests uniquement — filet `extract` des temps (CAP-1). */
  timesExtractFn?: (snippet: string) => Promise<TimesExtractPayload | null>;
  /** Injection tests uniquement — filet `extract` de catégorie (CAP-3). */
  categoryExtractFn?: (snippet: string) => Promise<CategoryExtractPayload | null>;
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

/** Motifs FR courants pour portions (premier entier > 0). */
const SERVINGS_FR_PATTERN =
  /(\d+)\s*(?:bons?\s+app[eé]tits?|personnes?|portions?|pers\.?\b)/gi;

function matchServingsFr(text: string): number | undefined {
  for (const match of text.matchAll(SERVINGS_FR_PATTERN)) {
    const n = parseInt(match[1], 10);
    if (n > 0) return n;
  }
  return undefined;
}

/** Premier entier > 0 dans un recipeYield Schema.org (string, number, tableau, QuantitativeValue). */
export function parseServings(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const fromFr = matchServingsFr(value);
    if (fromFr !== undefined) return fromFr;
    const m = value.match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0) return n;
    }
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseServings(item);
      if (parsed !== undefined) return parsed;
    }
    return undefined;
  }
  if (value && typeof value === "object" && "value" in value) {
    return parseServings((value as { value: unknown }).value);
  }
  return undefined;
}

export function extractServingsFromHtml(html: string): number | undefined {
  return matchServingsFr(html);
}

/** `null` / `undefined` / non-fini / `<= 0` = trou (ex. ISO PT20S → 0 min). */
function isMissingTimeMinutes(value: number | null | undefined): boolean {
  return value == null || !Number.isFinite(value) || value <= 0;
}

/** Convertit un fragment FR (« 20 min », « 2 h », « 1h30 », « 20 à 25 min », « une nuit ») en minutes. */
export function parseFrDurationToMinutes(text: string): number | undefined {
  if (!text || typeof text !== "string") return undefined;
  const t = text.trim();
  if (!t) return undefined;
  if (/\bune\s+nuit\b/i.test(t)) return 480;
  // Heures décimales (« 1.5 h », « 1,5 h ») — trop ambiguës pour un parse naïf.
  if (/\d+[.,]\d+\s*h/i.test(t)) return undefined;

  // Plages : borne haute (« 20 à 25 min », « 20-25 minutes »)
  const rangeMin = t.match(/(\d+)\s*(?:à|-|–|—)\s*(\d+)\s*min(?:utes?)?/i);
  if (rangeMin) {
    const low = parseInt(rangeMin[1], 10);
    const high = parseInt(rangeMin[2], 10);
    if (high < low) return undefined;
    return high > 0 ? high : undefined;
  }
  const rangeHour = t.match(
    /(\d+)\s*h(?:eures?)?(?:\s*(\d{1,2}))?\s*(?:à|-|–|—)\s*(\d+)\s*h(?:eures?)?(?:\s*(\d{1,2}))?/i
  );
  if (rangeHour) {
    const lowH = parseInt(rangeHour[1], 10);
    const lowM = rangeHour[2] ? parseInt(rangeHour[2], 10) : 0;
    const highH = parseInt(rangeHour[3], 10);
    const highM = rangeHour[4] ? parseInt(rangeHour[4], 10) : 0;
    if (lowM >= 60 || highM >= 60) return undefined;
    const lowTotal = lowH * 60 + lowM;
    const highTotal = highH * 60 + highM;
    if (highTotal < lowTotal) return undefined;
    return highTotal > 0 ? highTotal : undefined;
  }
  // « 20 à 25 h » (h seulement à droite) — ne pas retomber sur hourMatch → 25 h.
  if (/\d+\s*(?:à|-|–|—)\s*\d+\s*h(?:eures?)?/i.test(t)) return undefined;

  const hourMatch = t.match(/(\d+)\s*h(?:eures?)?\s*(\d{1,2})?/i);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10);
    let mins = hourMatch[2] ? parseInt(hourMatch[2], 10) : 0;
    if (!hourMatch[2]) {
      const after = t.slice((hourMatch.index ?? 0) + hourMatch[0].length);
      const trailingMin = after.match(/^\s*(\d+)\s*min(?:utes?)?/i);
      if (trailingMin) mins = parseInt(trailingMin[1], 10);
    }
    if (mins >= 60) return undefined;
    const total = hours * 60 + mins;
    return total > 0 ? total : undefined;
  }

  const minMatch = t.match(/(\d+)\s*min(?:utes?)?/i);
  if (minMatch) {
    const m = parseInt(minMatch[1], 10);
    return m > 0 ? m : undefined;
  }
  return undefined;
}

function htmlToPlainTextForTimes(html: string): string {
  // Espace avant chaque balise pour éviter « minCuisson » entre blocs adjacents.
  const $ = cheerio.load(html.replace(/</g, " <"));
  $("script, style").remove();
  const metaBits = [
    $('meta[name="description"]').attr("content"),
    $('meta[property="og:description"]').attr("content")
  ].filter((v): v is string => Boolean(v && v.trim()));
  const body = $.root().text();
  return `${metaBits.join(" ")} ${body}`.replace(/\s+/g, " ").trim();
}

export type RecipeTimesMinutes = {
  prepTimeMin?: number;
  cookTimeMin?: number;
  restTimeMin?: number;
};

/** Première durée parsable après un libellé (ignore les captures qui ne convertissent pas). */
function firstValidLabeledDuration(text: string, labelPattern: string): number | undefined {
  const re = new RegExp(labelPattern, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const mins = parseFrDurationToMinutes(match[1]);
    if (mins !== undefined) return mins;
  }
  return undefined;
}

/** Motifs FR « Préparation / Cuisson / Repos » (et fermentation / une nuit) dans HTML ou meta. */
export function extractTimesFromHtml(html: string): RecipeTimesMinutes {
  const text = htmlToPlainTextForTimes(html);
  const result: RecipeTimesMinutes = {};

  /** Durée immédiatement après un libellé (évite de croiser Cuisson/Repos sur la même ligne). */
  const durationToken =
    String.raw`une\s+nuit|\d+\s*h(?:eures?)?(?:\s*\d{1,2})?\s*(?:à|-|–|—)\s*\d+\s*h(?:eures?)?(?:\s*\d{1,2})?|\d+\s*(?:à|-|–|—)\s*\d+\s*(?:h(?:eures?)?(?:\s*\d{1,2})?(?:\s*min(?:utes?)?)?|min(?:utes?)?)|\d+\s*h(?:eures?)?(?:\s*\d{1,2})?(?:\s*min(?:utes?)?)?|\d+\s*min(?:utes?)?`;
  /** Accepte « : », tirets ou « de » (ex. Préparation de 20 min). */
  const durationAfterLabel = String.raw`\s*(?:[:\-–]\s*|de\s+)?(${durationToken})`;
  /** Frontière lettre/tiret (accents) — évite « précuisson » / « pré-cuisson » → cuisson. */
  const notLetter = String.raw`(?<![A-Za-zÀ-ÿ\-])`;

  const prep = firstValidLabeledDuration(
    text,
    String.raw`${notLetter}pr[ée]paration${durationAfterLabel}`
  );
  if (prep !== undefined) result.prepTimeMin = prep;

  const cook = firstValidLabeledDuration(
    text,
    String.raw`${notLetter}cuisson${durationAfterLabel}`
  );
  if (cook !== undefined) result.cookTimeMin = cook;

  const rest = firstValidLabeledDuration(
    text,
    String.raw`${notLetter}(?:temps\s+de\s+)?(?:repos|fermentation)${durationAfterLabel}`
  );
  if (rest !== undefined) result.restTimeMin = rest;

  return result;
}

function mergeTimesPreferringExisting(
  existing: RecipeTimesMinutes,
  fallback: RecipeTimesMinutes
): RecipeTimesMinutes {
  return {
    prepTimeMin: !isMissingTimeMinutes(existing.prepTimeMin)
      ? existing.prepTimeMin
      : fallback.prepTimeMin,
    cookTimeMin: !isMissingTimeMinutes(existing.cookTimeMin)
      ? existing.cookTimeMin
      : fallback.cookTimeMin,
    restTimeMin: !isMissingTimeMinutes(existing.restTimeMin)
      ? existing.restTimeMin
      : fallback.restTimeMin
  };
}

const TIMES_EXTRACT_SNIPPET_MAX = 2500;

/** Extrait court (meta + fenêtre HTML) pour le filet LLM `extract` — jamais la page entière. */
export function buildTimesExtractSnippet(html: string): string {
  // Même préfixe d’espace avant balises que l’heuristique — évite « minCuisson » collé.
  const $ = cheerio.load(html.replace(/</g, " <"));
  $("script, style").remove();
  const meta =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";
  const pickText = (raw: string): string => raw.replace(/\s+/g, " ").trim();
  const bodyText =
    pickText($("main").text()) ||
    pickText($("article").text()) ||
    pickText($(".recipe-content, .recipe-body, .recette").text()) ||
    pickText($("body").text()) ||
    "";
  return `${meta}\n${bodyText}`.replace(/\s+/g, " ").trim().slice(0, TIMES_EXTRACT_SNIPPET_MAX);
}

export type TimesExtractPayload = {
  prepTimeMin?: number | null;
  cookTimeMin?: number | null;
  restTimeMin?: number | null;
};

export function parseTimesExtractPayload(raw: string): TimesExtractPayload | null {
  let json = raw.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
  json = json.replace(/,(\s*[}\]])/g, "$1");
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as TimesExtractPayload;
  } catch {
    return null;
  }
}

function positiveMinutes(value: unknown): number | undefined {
  let n: number | undefined;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    n = Number(value);
  }
  if (n === undefined || !Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : undefined;
}

function coalesceDraftTime(
  existing: number | undefined,
  incoming: unknown
): number | undefined {
  if (!isMissingTimeMinutes(existing)) return existing;
  return positiveMinutes(incoming);
}

/** Fusionne un résultat extract uniquement sur les champs encore vides. */
export function applyTimesExtractToDraft(
  draft: ParsedRecipeDraft,
  extracted: TimesExtractPayload | null | undefined
): ParsedRecipeDraft {
  if (!extracted) return draft;
  const prepTimeMin = coalesceDraftTime(draft.prepTimeMin, extracted.prepTimeMin);
  const cookTimeMin = coalesceDraftTime(draft.cookTimeMin, extracted.cookTimeMin);
  const restTimeMin = coalesceDraftTime(draft.restTimeMin, extracted.restTimeMin);
  if (
    prepTimeMin === draft.prepTimeMin &&
    cookTimeMin === draft.cookTimeMin &&
    restTimeMin === draft.restTimeMin
  ) {
    return draft;
  }
  return { ...draft, prepTimeMin, cookTimeMin, restTimeMin };
}

async function detectTimesWithOpenAiExtract(
  snippet: string
): Promise<TimesExtractPayload | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Tu aides une app de cuisine à extraire les temps d'une recette française.
Retourne uniquement un JSON valide, sans markdown :
{"prepTimeMin": number|null, "cookTimeMin": number|null, "restTimeMin": number|null}

Règles :
- prepTimeMin = temps de préparation en minutes.
- cookTimeMin = temps de cuisson en minutes.
- restTimeMin = temps de repos / fermentation / levée en minutes.
- Si une durée est absente ou trop ambiguë, mets null.
- Comprendre min, minutes, h, heures, et approximations courantes (ex: "une nuit" → 480).
- Si une plage est donnée (ex: "20 à 25 min"), choisir la borne haute.
- Ne retourne jamais de texte hors JSON.

Extrait :
${snippet}`;

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: getChatModel("extract"),
      temperature: 0,
      messages: [{ role: "user", content: prompt }]
    });
    const rawContent = completion.choices[0]?.message?.content?.trim();
    if (!rawContent) return null;
    return parseTimesExtractPayload(rawContent);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Recipe times extract failed", error);
    return null;
  }
}

/**
 * Filet CAP-1 : si un temps manque encore et qu'une clé API est présente,
 * appelle `getChatModel("extract")` sur un extrait court et ne remplit que les trous.
 */
export async function enrichMissingRecipeTimesWithExtract(
  draft: ParsedRecipeDraft,
  html: string,
  extractFn?: (snippet: string) => Promise<TimesExtractPayload | null>
): Promise<ParsedRecipeDraft> {
  const needsPrep = isMissingTimeMinutes(draft.prepTimeMin);
  const needsCook = isMissingTimeMinutes(draft.cookTimeMin);
  const needsRest = isMissingTimeMinutes(draft.restTimeMin);
  if (!needsPrep && !needsCook && !needsRest) return draft;

  if (!extractFn && !process.env.OPENAI_API_KEY) return draft;

  const snippet = buildTimesExtractSnippet(html);
  if (snippet.length < 10) return draft;

  try {
    const runExtract = extractFn ?? detectTimesWithOpenAiExtract;
    const extracted = await runExtract(snippet);
    return applyTimesExtractToDraft(draft, extracted);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Recipe times extract failed", error);
    return draft;
  }
}

const CATEGORY_EXTRACT_SNIPPET_MAX = 1500;

/** Lexique FR (normalisé sans accents) — desserts / sucré. */
const SUCRE_LEXICON = [
  "dessert",
  "gateau",
  "gateaux",
  "patisserie",
  "viennoiserie",
  "confiserie",
  "tiramisu",
  "fondant",
  "brownie",
  "cookie",
  "cookies",
  "muffin",
  "cupcake",
  "mousse au chocolat",
  "mousse chocolat",
  "creme brulee",
  "creme caramel",
  "flan",
  "clafoutis",
  "madeleine",
  "financier",
  "macaron",
  "eclair",
  "chou a la creme",
  "profiterole",
  "profiteroles",
  "panna cotta",
  "pannacotta",
  "cheesecake",
  "crumble",
  "tarte tatin",
  "tarte au citron",
  "tarte aux pommes",
  "tarte aux fraises",
  "foret noire",
  "millefeuille",
  "opera",
  "kouign",
  "canele",
  "pain d epices",
  "pain perdu",
  "riz au lait",
  "ile flottante",
  "meringue",
  "pavlova",
  "sorbet",
  "glace",
  "parfait",
  "gaufre",
  "gaufres",
  "beignet",
  "beignets",
  "donut",
  "donuts",
  "sable",
  "biscuits",
  "compote",
  "confiture",
  "nougat",
  "caramel",
  "chocolat chaud",
  "moelleux au chocolat",
  "fondant au chocolat",
  "banana bread",
  "sweet",
  "sweets",
  "cake",
  "cakes",
  "pastry",
  "pastries"
];

/** Lexique FR (normalisé sans accents) — plats salés. */
const SALE_LEXICON = [
  "poulet",
  "boeuf",
  "veau",
  "porc",
  "agneau",
  "canard",
  "dinde",
  "poisson",
  "saumon",
  "thon",
  "cabillaud",
  "crevette",
  "crevettes",
  "moules",
  "quiche",
  "pizza",
  "pates",
  "lasagne",
  "lasagnes",
  "risotto",
  "blanquette",
  "bourguignon",
  "boeuf bourguignon",
  "tajine",
  "tagine",
  "curry",
  "soupe",
  "potage",
  "veloute",
  "gratin",
  "burger",
  "sandwich",
  "omelette",
  "frittata",
  "roti",
  "escalope",
  "cotelette",
  "saucisse",
  "charcuterie",
  "fromage sale",
  "plat principal",
  "main course",
  "main dish",
  "savory",
  "savoury",
  "appetizer",
  "aperitif",
  "entree salee"
];

/** Catégories Schema.org / mots-clés mappés → SUCRE. */
const SUCRE_CATEGORY_KEYWORDS = [
  "dessert",
  "desserts",
  "patisserie",
  "viennoiserie",
  "confiserie",
  "sweet",
  "sweets",
  "gouter",
  "sucre",
  "sucree",
  "sucres"
];

/** Catégories Schema.org / mots-clés mappés → SALE. */
const SALE_CATEGORY_KEYWORDS = [
  "main course",
  "main dish",
  "plat principal",
  "plats principaux",
  "entree",
  "entrees",
  "savory",
  "savoury",
  "sale",
  "salee",
  "sales",
  "aperitif",
  "appetizer",
  "starter",
  "side dish",
  "viande",
  "poisson",
  "soupe"
];

function normalizeForCategoryMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textHasCategoryTerm(haystack: string, term: string): boolean {
  const h = normalizeForCategoryMatch(haystack);
  const t = normalizeForCategoryMatch(term);
  if (!h || !t) return false;
  // Mot simple ou expression multi-mots : bornes de token (évite les sous-chaînes).
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`);
  return re.test(h);
}

function flattenSchemaStringList(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") {
    return value
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenSchemaStringList(item));
  }
  return [];
}

export type CategorySignalKind = "SUCRE" | "SALE" | "ambiguous" | "none";

export type CategoryClassifyResult = {
  kind: CategorySignalKind;
  category: RecipeCategory;
  /** Signal univoque SUCRE ou SALE (lexique / mot-clé mappé) — pas un défaut. */
  explicit: boolean;
};

export type CategorySignals = {
  title?: string;
  meta?: string;
  keywords?: string[];
};

/**
 * Classification CAP-3 : lexique FR + mots-clés Schema.org mappables.
 * Signaux contradictoires → ambiguous (catégorie provisoire SALE).
 * Aucun indice → none (défaut SALE).
 */
export function classifyCategoryFromSignals(signals: CategorySignals): CategoryClassifyResult {
  const title = signals.title ?? "";
  const meta = signals.meta ?? "";
  const keywords = signals.keywords ?? [];
  const corpus = [title, meta, ...keywords].filter(Boolean).join(" \n ");

  let sucreHits = 0;
  let saleHits = 0;

  for (const kw of keywords) {
    if (typeof kw !== "string") continue;
    if (SUCRE_CATEGORY_KEYWORDS.some((term) => textHasCategoryTerm(kw, term))) sucreHits += 1;
    if (SALE_CATEGORY_KEYWORDS.some((term) => textHasCategoryTerm(kw, term))) saleHits += 1;
  }

  for (const term of SUCRE_LEXICON) {
    if (textHasCategoryTerm(corpus, term)) sucreHits += 1;
  }
  for (const term of SALE_LEXICON) {
    if (textHasCategoryTerm(corpus, term)) saleHits += 1;
  }

  if (sucreHits > 0 && saleHits === 0) {
    return { kind: "SUCRE", category: "SUCRE", explicit: true };
  }
  if (saleHits > 0 && sucreHits === 0) {
    return { kind: "SALE", category: "SALE", explicit: true };
  }
  if (sucreHits > 0 && saleHits > 0) {
    return { kind: "ambiguous", category: "SALE", explicit: false };
  }
  return { kind: "none", category: "SALE", explicit: false };
}

export function extractCategoryMetaFromHtml(html: string): string {
  const $ = cheerio.load(html);
  return (
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    ""
  );
}

export function extractCategoryKeywordsFromHtml(html: string): string[] {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');
  const out: string[] = [];
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
          out.push(...flattenSchemaStringList(item.recipeCategory));
          out.push(...flattenSchemaStringList(item.keywords));
        }
      }
    } catch {
      // ignore invalid JSON
    }
  }
  return out;
}

export function buildCategoryExtractSnippet(html: string, title?: string): string {
  const meta = extractCategoryMetaFromHtml(html);
  const keywords = extractCategoryKeywordsFromHtml(html);
  const parts = [title?.trim() || "", meta, keywords.join(", ")].filter(Boolean);
  return parts.join("\n").replace(/\s+/g, " ").trim().slice(0, CATEGORY_EXTRACT_SNIPPET_MAX);
}

export type CategoryExtractPayload = {
  category?: string | null;
};

export function parseCategoryExtractPayload(raw: string): CategoryExtractPayload | null {
  let json = raw.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
  json = json.replace(/,(\s*[}\]])/g, "$1");
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as CategoryExtractPayload;
  } catch {
    return null;
  }
}

function normalizeExtractedCategory(value: unknown): RecipeCategory | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeForCategoryMatch(value).toUpperCase();
  if (normalized === "SUCRE" || normalized === "SALE") return normalized;
  return undefined;
}

/** Applique un résultat extract si la valeur est SUCRE ou SALE. */
export function applyCategoryExtractToDraft(
  draft: ParsedRecipeDraft,
  extracted: CategoryExtractPayload | null | undefined
): ParsedRecipeDraft {
  if (!extracted) return draft;
  const next = normalizeExtractedCategory(extracted.category);
  if (!next || draft.category === next) return draft;
  return { ...draft, category: next };
}

async function detectCategoryWithOpenAiExtract(
  snippet: string
): Promise<CategoryExtractPayload | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Tu aides une app de cuisine à classer une recette française en SUCRE (dessert / pâtisserie / sucré) ou SALE (plat salé).
Retourne uniquement un JSON valide, sans markdown :
{"category": "SUCRE"|"SALE"|null}

Règles :
- SUCRE = dessert, gâteau, pâtisserie, glace, confiserie.
- SALE = plat principal, entrée salée, viande, poisson, légumes salés.
- Si trop ambigu, mets null.
- Ne retourne jamais de texte hors JSON.

Extrait :
${snippet}`;

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: getChatModel("extract"),
      temperature: 0,
      messages: [{ role: "user", content: prompt }]
    });
    const rawContent = completion.choices[0]?.message?.content?.trim();
    if (!rawContent) return null;
    return parseCategoryExtractPayload(rawContent);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Recipe category extract failed", error);
    return null;
  }
}

/**
 * Filet CAP-3 : si la catégorie n’est pas classée explicitement (lexique / mots-clés),
 * appelle `getChatModel("extract")` sur un extrait court en cas d’ambiguïté.
 * Ne bloque jamais l’import ; défaut SALE sans indices ou en soft-fail.
 */
export async function enrichMissingCategoryWithExtract(
  draft: ParsedRecipeDraft,
  html: string,
  extractFn?: (snippet: string) => Promise<CategoryExtractPayload | null>
): Promise<ParsedRecipeDraft> {
  const signals: CategorySignals = {
    title: draft.title,
    meta: extractCategoryMetaFromHtml(html),
    keywords: extractCategoryKeywordsFromHtml(html)
  };
  const classified = classifyCategoryFromSignals(signals);

  if (classified.explicit) {
    return draft.category === classified.category
      ? draft
      : { ...draft, category: classified.category };
  }

  // Aucun indice utile → conserver le draft (défaut SALE déjà posé en amont) ; ne jamais
  // écraser un SUCRE déjà présent faute de signal.
  if (classified.kind === "none") {
    return draft;
  }

  // Ambigu page-wide : si titre+meta seuls sont univoques, aligner sans filet (ne pas
  // laisser des mots-clés d’autres blocs Recipe écraser un signal clair).
  const titleMetaOnly = classifyCategoryFromSignals({
    title: draft.title,
    meta: signals.meta
  });
  if (titleMetaOnly.explicit) {
    return draft.category === titleMetaOnly.category
      ? draft
      : { ...draft, category: titleMetaOnly.category };
  }

  // Un SUCRE déjà posé en amont (ex. recipeCategory item) n’est jamais le défaut : le
  // conserver face à une ambiguïté page-wide + extract.
  if (draft.category === "SUCRE") {
    return draft;
  }

  // Ambigu : filet extract si disponible ; soft-fail / sans clé → conserver le draft
  if (!extractFn && !process.env.OPENAI_API_KEY) {
    return draft;
  }

  const snippet = buildCategoryExtractSnippet(html, draft.title);
  if (snippet.length < 3) {
    return draft;
  }

  try {
    const runExtract = extractFn ?? detectCategoryWithOpenAiExtract;
    const extracted = await runExtract(snippet);
    return applyCategoryExtractToDraft(draft, extracted);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Recipe category extract failed", error);
    return draft;
  }
}

const UNIT_PATTERN =
  /(?:litres?|g(?:r?)?|kg|ml|cl|L|cuillère[s]?\s+à\s+soupe|cuillère[s]?\s+à\s+café|c\.?\s*à\s*s\.?|c\.?\s*à\s*c\.?|cc|cs|CC|pincée|œufs|oeufs|œuf|oeuf|unités|unité|pièces|pièce|tranches|tranche|feuilles|feuille|verres|verre|oignons|oignon|pavés|pavé|gousses|gousse)/i;

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
      const isScalable = !/pincée|sel|poivre|à volonté/i.test((unit ?? "") + " " + label);
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
  recipeCategory?: string | string[];
  keywords?: string | string[];
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

function resolveAgainstBase(url: string, baseUrl: string): string {
  const t = url.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  if (t.startsWith("//")) return `https:${t}`;
  try {
    return new URL(t, baseUrl).href;
  } catch {
    return t;
  }
}

function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls.filter((u) => /^https?:\/\//i.test(u)))];
}

function extractAllImageUrlsFromField(image: unknown, baseUrl: string): string[] {
  if (!image) return [];
  const raw: string[] = [];
  const push = (u: string | undefined) => {
    if (u && typeof u === "string" && u.trim()) raw.push(resolveAgainstBase(u.trim(), baseUrl));
  };
  if (typeof image === "string") push(image);
  else if (Array.isArray(image)) {
    for (const item of image) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object" && "url" in item)
        push((item as { url?: string }).url);
    }
  } else if (typeof image === "object" && image !== null && "url" in image) {
    push((image as { url?: string }).url);
  }
  return dedupeUrls(raw);
}

function extractVideoUrlsFromField(video: unknown, baseUrl: string): string[] {
  if (!video) return [];
  const raw: string[] = [];
  const push = (u: string | undefined) => {
    if (!u || typeof u !== "string") return;
    const t = u.trim();
    if (!t) return;
    const resolved =
      t.startsWith("//")
        ? `https:${t}`
        : t.startsWith("http://") || t.startsWith("https://")
          ? t
          : /^https?:\/\//i.test(resolveAgainstBase(t, baseUrl))
            ? resolveAgainstBase(t, baseUrl)
            : "";
    if (resolved && /^https?:\/\//i.test(resolved)) raw.push(resolved);
  };
  const visit = (v: unknown): void => {
    if (!v) return;
    if (typeof v === "string") {
      push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) visit(x);
      return;
    }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      push(typeof o.contentUrl === "string" ? o.contentUrl : undefined);
      push(typeof o.embedUrl === "string" ? o.embedUrl : undefined);
      const id = o["@id"];
      if (typeof id === "string" && /^https?:\/\//i.test(id)) push(id);
      if (o.video) visit(o.video);
    }
  };
  visit(video);
  return dedupeUrls(raw);
}

function buildMediaDraftsForInstructionNode(
  node: Record<string, unknown>,
  baseUrl: string
): StepMediumDraft[] | undefined {
  const imageUrls = extractAllImageUrlsFromField(node.image, baseUrl);
  const videoUrls = extractVideoUrlsFromField(node.video, baseUrl);
  const media: StepMediumDraft[] = [];
  for (const imageUrl of imageUrls) media.push({ type: "image", imageUrl });
  for (const url of videoUrls) media.push({ type: "video", url });
  return media.length > 0 ? media : undefined;
}

export interface ExtractedInstructionStep {
  text: string;
  media?: StepMediumDraft[];
}

export function extractInstructionSteps(
  rawInstruction: unknown,
  baseUrl: string
): ExtractedInstructionStep[] {
  if (typeof rawInstruction === "string") {
    const normalized = normalizeInstructionText(rawInstruction);
    return normalized ? [{ text: normalized }] : [];
  }
  if (Array.isArray(rawInstruction)) {
    return rawInstruction.flatMap((entry) => extractInstructionSteps(entry, baseUrl));
  }
  if (!rawInstruction || typeof rawInstruction !== "object") {
    return [];
  }

  const instructionNode = rawInstruction as Record<string, unknown>;
  const nestedInstructionEntries = [instructionNode.itemListElement, instructionNode.item].flatMap(
    (entry) => extractInstructionSteps(entry, baseUrl)
  );
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
  if (!normalized) return [];
  const media = buildMediaDraftsForInstructionNode(instructionNode, baseUrl);
  return [{ text: normalized, media }];
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

const IMAGE_LINK_HREF_RE = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;

function isLikelyRecipeOutroParagraph(text: string): boolean {
  const t = text.trim();
  if (t.length > 380) return true;
  return /^(voilà|j'espère|j’espère|en attendant|merci\s|n'hésitez|n’hésitez)/i.test(t);
}

function isImageGalleryParagraph($: cheerio.CheerioAPI, $p: cheerio.Cheerio<AnyNode>): boolean {
  if ($p.is("[uk-lightbox]")) return true;
  const plain = $p.text().replace(/\s+/g, " ").trim();
  const links = $p.find("a[href]");
  if (links.length === 0) return false;
  if (plain.length > 28) return false;
  let hits = 0;
  links.each((_, a) => {
    const h = $(a).attr("href") ?? "";
    if (IMAGE_LINK_HREF_RE.test(h)) hits += 1;
  });
  return hits > 0;
}

function collectImageUrlsFromGalleryP(
  $: cheerio.CheerioAPI,
  $p: cheerio.Cheerio<AnyNode>,
  baseUrl: string
): string[] {
  const urls: string[] = [];
  $p.find("a[href]").each((_, a) => {
    const h = $(a).attr("href");
    if (!h || !IMAGE_LINK_HREF_RE.test(h)) return;
    const resolved = resolveAgainstBase(h.trim(), baseUrl);
    if (/^https?:\/\//i.test(resolved)) urls.push(resolved);
  });
  return dedupeUrls(urls);
}

/**
 * Best-effort : étapes en paragraphes suivies de blocs galerie (ex. WordPress + uk-lightbox).
 * Ne remplace pas le JSON-LD ; sert à enrichir les drafts issus du LLM ou incomplets.
 */
export function extractHtmlInlineStepMediaSegments(
  html: string,
  baseUrl: string
): Array<{ text: string; imageUrls: string[] }> {
  const $ = cheerio.load(html);
  const container =
    $(".contenu_recette").first().length > 0
      ? $(".contenu_recette").first()
      : $(".entry-content").first().length > 0
        ? $(".entry-content").first()
        : $("article .post-content").first().length > 0
          ? $("article .post-content").first()
          : null;
  if (!container || container.length === 0) return [];

  const segments: Array<{ text: string; imageUrls: string[] }> = [];
  let afterOutro = false;
  container.children("p").each((_, el) => {
    const $p = $(el);
    if (isImageGalleryParagraph($, $p)) {
      if (afterOutro) {
        afterOutro = false;
        return;
      }
      const urls = collectImageUrlsFromGalleryP($, $p, baseUrl);
      if (segments.length > 0 && urls.length > 0) {
        const last = segments[segments.length - 1]!;
        for (const u of urls) {
          if (!last.imageUrls.includes(u)) last.imageUrls.push(u);
        }
      }
      return;
    }
    const text = normalizeInstructionText($p.text() ?? "");
    if (!text || text.length < 12) return;
    if (isLikelyRecipeOutroParagraph(text)) {
      afterOutro = true;
      return;
    }
    afterOutro = false;
    segments.push({ text, imageUrls: [] });
  });
  return segments.filter((s) => s.text);
}

function mergeHtmlSegmentsIntoDraftSteps(
  steps: ParsedInstructionStep[],
  segments: Array<{ text: string; imageUrls: string[] }>
): ParsedInstructionStep[] {
  if (!segments.length || !steps.length) return steps;

  if (steps.length === segments.length) {
    return steps.map((s, i) => {
      if (s.media?.length) return s;
      const urls = segments[i]?.imageUrls ?? [];
      if (!urls.length) return s;
      return {
        ...s,
        media: urls.map((imageUrl) => ({ type: "image" as const, imageUrl }))
      };
    });
  }

  const used = new Set<number>();
  const norm = (t: string) =>
    t
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\u2019|’/g, "'")
      .trim();

  return steps.map((step) => {
    if (step.media?.length) return step;
    const nt = norm(step.text);
    let best = -1;
    let bestLen = 0;
    for (let i = 0; i < segments.length; i++) {
      if (used.has(i)) continue;
      const st = norm(segments[i]!.text);
      if (st.length < 14) continue;
      if (nt.includes(st) || st.includes(nt.slice(0, Math.min(56, nt.length)))) {
        if (st.length > bestLen) {
          bestLen = st.length;
          best = i;
        }
      }
    }
    if (best < 0) return step;
    used.add(best);
    const urls = segments[best]!.imageUrls;
    if (!urls.length) return step;
    return {
      ...step,
      media: urls.map((imageUrl) => ({ type: "image" as const, imageUrl }))
    };
  });
}

function mergeHtmlInlineStepMediaIntoDraft(
  draft: ParsedRecipeDraft,
  html: string,
  baseUrl: string
): ParsedRecipeDraft {
  const segments = extractHtmlInlineStepMediaSegments(html, baseUrl);
  if (!segments.length) return draft;
  const nextSteps = mergeHtmlSegmentsIntoDraftSteps(draft.steps, segments);
  const changed = nextSteps.some((s, i) => s !== draft.steps[i]);
  if (!changed) return draft;
  return { ...draft, steps: nextSteps };
}

export function extractRecipeFromJsonLd(html: string, baseUrl: string): ParsedRecipeDraft | null {
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
          const extracted = extractInstructionSteps(rawSteps, baseUrl);
          const steps: ParsedInstructionStep[] = extracted.map((s, idx) => ({
            id: `step-${idx}-${Date.now()}`,
            order: idx + 1,
            text: s.text,
            ...(s.media ? { media: s.media } : {})
          }));

          const imageUrl = extractImageUrl(item.image);
          const resolvedImage =
            imageUrl && imageUrl.startsWith("http")
              ? imageUrl
              : imageUrl
                ? new URL(imageUrl, baseUrl).href
                : undefined;

          const servingsBase =
            parseServings(item.recipeYield) ?? extractServingsFromHtml(html);

          const timesFromIso: RecipeTimesMinutes = {
            prepTimeMin: parseIso8601DurationToMinutes(item.prepTime),
            cookTimeMin: parseIso8601DurationToMinutes(item.cookTime)
          };
          const times = mergeTimesPreferringExisting(
            timesFromIso,
            extractTimesFromHtml(html)
          );

          const categorySignals: CategorySignals = {
            title: String(name).trim(),
            meta: extractCategoryMetaFromHtml(html),
            keywords: [
              ...flattenSchemaStringList(item.recipeCategory),
              ...flattenSchemaStringList(item.keywords)
            ]
          };
          const category = classifyCategoryFromSignals(categorySignals).category;

          return {
            title: String(name).trim(),
            category,
            servingsBase,
            ingredients,
            steps: steps.filter((s) => s.text),
            prepTimeMin: times.prepTimeMin,
            cookTimeMin: times.cookTimeMin,
            restTimeMin: times.restTimeMin,
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
  restTimeMin?: number;
  ingredients?: Array<{
    label?: string;
    quantity?: number;
    unit?: string;
    isScalable?: boolean;
  }>;
  steps?: Array<{ order?: number; text?: string }>;
}

/**
 * Extrait le numéro d'étape en début de texte (ex. "25. Égaliser...", "Étape 11 :").
 * Exige un délimiteur de numérotation (`.` `)` `-` `:`) après le chiffre — pas un
 * simple espace — pour éviter les faux positifs du type « 15 minutes… », « 3 œufs… ».
 */
export function extractStepNumberFromText(text: string | null | undefined): number | undefined {
  const trimmed = String(text ?? "").trim();
  const m = trimmed.match(/^(\d+)[\.\)\-:]|^Étape\s+(\d+)/i);
  const n = m ? parseInt(m[1] ?? m[2] ?? "", 10) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 999 ? n : undefined;
}

/**
 * Connecteurs chrono FR (signal auxiliaire CAP-4, détectable via stepsHaveChronoConnectors).
 * En v1 : n’influencent pas `confident` et ne permettent jamais d’inventer un ordre ;
 * sans numéros cohérents → non confiant (LLM si clé, sinon ordre source).
 */
export const CHRONO_STEP_CONNECTOR_RE =
  /\b(puis|ensuite|enfin|finalement|réserver|apres|après|d['']abord|premièrement)\b/i;

export function stepsHaveChronoConnectors(steps: ParsedInstructionStep[]): boolean {
  return steps.some((s) => CHRONO_STEP_CONNECTOR_RE.test(String(s.text ?? "")));
}

export type LightFirstReorderResult = {
  /** true = ordre fiable sans appel LLM */
  confident: boolean;
  steps: ParsedInstructionStep[];
};

/**
 * Gate CAP-4 light-first : numéros cohérents (tous extractibles, distincts) → tri
 * (y compris si l’entrée était dans le désordre) sans LLM ;
 * doublons / fraction numérotée / aucun numéro fiable → non confiant (LLM si clé).
 * Quand `confident: false`, `steps` est l’ordre source inchangé (pas un nouvel ordre
 * heuristique). Les connecteurs chrono sont détectables mais n’influencent pas `confident` en v1.
 */
export function tryLightFirstStepReorder(
  steps: ParsedInstructionStep[]
): LightFirstReorderResult {
  if (steps.length <= 1) {
    return { confident: true, steps };
  }

  const annotated = steps.map((step) => ({
    step,
    num: extractStepNumberFromText(String(step.text ?? ""))
  }));
  const withNumbers = annotated.filter((a) => a.num !== undefined);

  if (withNumbers.length === steps.length) {
    const nums = withNumbers.map((a) => a.num!);
    const unique = new Set(nums).size === nums.length;
    if (unique) {
      const sorted = [...withNumbers].sort((a, b) => a.num! - b.num!);
      return {
        confident: true,
        steps: sorted.map((a, i) => ({ ...a.step, order: i + 1 }))
      };
    }
    // Doublons de numéros → ambigu ; conserver l’ordre source
    return { confident: false, steps };
  }

  // Fraction seulement numérotée, ou aucun numéro fiable → ordre source inchangé.
  return { confident: false, steps };
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
  const rawSteps = (parsed.steps ?? [])
    .map((s) => ({ ...s, text: String(s.text ?? "").trim() }))
    .filter((s) => s.text);
  const steps = rawSteps
    .map((s, idx) => {
      const text = s.text!;
      const fromText = extractStepNumberFromText(text);
      const order = fromText ?? (typeof s.order === "number" ? s.order : undefined) ?? idx + 1;
      return { order, text, idx };
    })
    .sort((a, b) => a.order - b.order)
    .map((s, idx) => ({
      id: `step-${idx}-${Date.now()}`,
      order: idx + 1,
      text: s.text
    }));

  return {
    title,
    category,
    servingsBase: typeof parsed.servingsBase === "number" ? parsed.servingsBase : undefined,
    ingredients,
    steps,
    prepTimeMin: typeof parsed.prepTimeMin === "number" ? parsed.prepTimeMin : undefined,
    cookTimeMin: typeof parsed.cookTimeMin === "number" ? parsed.cookTimeMin : undefined,
    restTimeMin: typeof parsed.restTimeMin === "number" ? parsed.restTimeMin : undefined,
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
  "restTimeMin": temps de repos en minutes si mentionné (nombre ou null),
  "ingredients": [{"label": "nom", "quantity": nombre ou null, "unit": "unité", "isScalable": true/false}],
  "steps": [{"order": 1, "text": "description étape"}]
}
Pour les ingrédients : quantity et unit optionnels. Reconnaître : g/gr (grammes), CC/c à c (cuillère à café), c à s (cuillère à soupe), fractions (1/2 = demi), verre, oignon, pavé, etc. isScalable=true par défaut dès qu'il y a une quantité numérique (farine, œufs, pavés de saumon, verre de vin, oignons), false uniquement pour "sel", "poivre", "pincée", "à volonté".
Pour les étapes : extraire toute préparation ou instructions présentes (même partielles). Si le texte ne contient que des ingrédients, mettre steps: [].
Texte à analyser :

${text.slice(0, 12000)}`;

  try {
    const completion = await client.chat.completions.create({
      model: getChatModel("parse"),
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
  "restTimeMin": temps de repos en minutes si mentionné (nombre ou null),
  "ingredients": [{"label": "nom", "quantity": nombre ou null, "unit": "unité", "isScalable": true/false}],
  "steps": [{"order": 1, "text": "description étape"}]
}
Règles :
- Extraire uniquement ce qui est lisible sur l'image.
- Si une valeur n'est pas lisible, mettre null (ou [] pour listes).
- Conserver les ingrédients en français quand possible.
- isScalable=true par défaut dès qu'il y a une quantité (pavés, verre, oignons, etc.), false uniquement pour sel, poivre, pincée, à volonté.
- IMPORTANT pour les étapes : si des numéros sont affichés sur l'image (badges, encadrés), les respecter strictement. Utiliser ces numéros comme "order" ET les inclure au début du texte (ex. "25. Égaliser les bords..."). Sinon, ordre de lecture (1, 2, 3...).`;

  try {
    const completion = await client.chat.completions.create({
      model: getChatModel("parse"),
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
    let draft = toDraftFromLlmPayload(parsed, sourceType, url);
    if (draft.steps.length > 1) {
      draft = {
        ...draft,
        steps: await reorderStepsByRecipeLogic(draft.steps)
      };
    }
    return draft;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("OpenAI screenshot parse error", err);
    return fallbackDraft("Recette depuis capture", sourceType, url);
  }
}

/**
 * Réordonnancement CAP-4 light-first : heuristiques (numéros cohérents) d’abord ;
 * LLM `reorder` (luna) seulement si désordre / ambiguïté et clé présente.
 * Soft-fail / sans clé → ordre source (quand non confiant, `light.steps` n’est pas
 * un nouvel ordre heuristique) ; import jamais bloqué.
 *
 * @param reorderFn injection tests — remplace l’appel OpenAI ; reçoit les étapes
 *   (ordre source si non confiant) et renvoie le JSON LLM `[{ text }]` (ou null = soft-fail).
 */
export async function reorderStepsByRecipeLogic(
  steps: ParsedInstructionStep[],
  reorderFn?: (
    steps: ParsedInstructionStep[]
  ) => Promise<Array<{ text?: string }> | null>
): Promise<ParsedInstructionStep[]> {
  if (steps.length <= 1) return steps;

  const light = tryLightFirstStepReorder(steps);
  if (light.confident) {
    return light.steps;
  }

  // Non confiant : ordre source inchangé (pas un réordonnancement heuristique).
  const sourceOrder = light.steps;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!reorderFn && !apiKey) {
    return sourceOrder;
  }

  try {
    if (reorderFn) {
      const arr = await reorderFn(sourceOrder);
      // Même garde que le chemin OpenAI : non-tableau / vide → conserver la source
      if (!Array.isArray(arr) || arr.length === 0) return sourceOrder;
      return rematchReorderedSteps(sourceOrder, arr);
    }
    return await reorderStepsWithOpenAI(sourceOrder, apiKey!);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("reorderStepsByRecipeLogic error", err);
    return sourceOrder;
  }
}

/** Rematch texte LLM → étapes source (préserve id / media). */
export function rematchReorderedSteps(
  source: ParsedInstructionStep[],
  arr: Array<{ text?: string }>
): ParsedInstructionStep[] {
  const normalized = (t: string) => t.replace(/^\d+[\.\)\s\-:]/, "").trim().toLowerCase();
  const remaining = new Map<string, ParsedInstructionStep>();
  for (const s of source) {
    const k = normalized(s.text);
    if (!remaining.has(k)) remaining.set(k, s);
  }

  const reordered: ParsedInstructionStep[] = [];
  const used = new Set<ParsedInstructionStep>();

  for (let i = 0; i < arr.length; i++) {
    const text = String(arr[i]?.text ?? "").trim();
    if (!text) continue;
    const norm = normalized(text);
    const orig = remaining.get(norm);
    if (orig && !used.has(orig)) {
      used.add(orig);
      remaining.delete(norm);
      reordered.push({ ...orig, order: i + 1 });
    } else {
      reordered.push({
        id: `step-${i + 1}-${Date.now()}`,
        order: i + 1,
        text
      });
    }
  }
  for (const [, s] of remaining) {
    reordered.push({ ...s, order: reordered.length + 1 });
  }
  return reordered;
}

async function reorderStepsWithOpenAI(
  steps: ParsedInstructionStep[],
  apiKey: string
): Promise<ParsedInstructionStep[]> {
  const stepTexts = steps.map((s) => s.text).join("\n");
  const prompt = `Des étapes de recette ont été extraites dans un ordre possiblement incorrect.
Réordonne-les pour suivre la logique chronologique d'exécution :
1. Préparation des ingrédients
2. Mélange / pâte
3. Cuisson
4. Refroidissement
5. Assemblage / montage
6. Finition (égaliser, saupoudrer, dresser, réserver au frais)

Réponds UNIQUEMENT avec un JSON valide : [{"text": "étape 1"}, {"text": "étape 2"}, ...]
Conserve le texte de chaque étape à l'identique. Ne fusionne pas, ne modifie pas.

Étapes à réordonner :
${stepTexts}`;

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: getChatModel("reorder"),
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1
  });
  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return steps;
  let arr: Array<{ text?: string }>;
  try {
    const json = raw.replace(/^```json?\s*|\s*```$/g, "").replace(/,(\s*[}\]])/g, "$1");
    arr = JSON.parse(json);
  } catch {
    return steps;
  }
  if (!Array.isArray(arr) || arr.length === 0) return steps;
  return rematchReorderedSteps(steps, arr);
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
        const withMedia = mergeHtmlInlineStepMediaIntoDraft(jsonLdDraft, html, baseUrl);
        const withTimes = await enrichMissingRecipeTimesWithExtract(
          withMedia,
          html,
          input.timesExtractFn
        );
        return await enrichMissingCategoryWithExtract(
          withTimes,
          html,
          input.categoryExtractFn
        );
      }

      const text = extractMainText(html);
      if (text.length > 100) {
        const aiDraft = await parseWithOpenAI(text, ogImage, url, sourceType, "Recette depuis URL");
        return mergeHtmlInlineStepMediaIntoDraft(aiDraft, html, baseUrl);
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
          const withMedia = mergeHtmlInlineStepMediaIntoDraft(jsonLdDraft, html, url);
          const withTimes = await enrichMissingRecipeTimesWithExtract(
            withMedia,
            html,
            input.timesExtractFn
          );
          const withCategory = await enrichMissingCategoryWithExtract(
            withTimes,
            html,
            input.categoryExtractFn
          );
          return withSourceType(withCategory, sourceType, url);
        }

        const mergedText = [input.shareTitle, input.text, extractMainText(html)]
          .filter((chunk): chunk is string => Boolean(chunk?.trim()))
          .join("\n\n");
        const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
        if (hasOpenAiKey && mergedText.length > 100) {
          const shareDraft = await parseWithOpenAI(mergedText, ogImage, url, sourceType);
          return withSourceType(mergeHtmlInlineStepMediaIntoDraft(shareDraft, html, url), sourceType, url);
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
