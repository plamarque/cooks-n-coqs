import type {
  ImportType,
  IngredientLine,
  InstructionStep,
  ParsedInstructionStep,
  ParsedRecipeDraft,
  Recipe
} from "@cookies-et-coquilettes/domain";
import { resolveDisplayedServings } from "./recipe-detail-selection";

/** CTA soft — dernière ligne du payload F2 (hors en-têtes). */
export const RECIPE_SHARE_F2_CTA =
  "Tu veux garder cette recette ? https://plamarque.github.io/cooks-n-coqs/";

/** CTA historique (messages déjà envoyés avant renommage repo) — ignoré au parse uniquement. */
export const RECIPE_SHARE_F2_CTA_LEGACY =
  "Tu veux garder cette recette ? https://plamarque.github.io/cookies-et-coquilettes/";

/** En-têtes reconnus au parse (wire sortant : Ingrédients/Étapes/Source ; compat : Titre/Portions). */
const F2_HEADERS = ["Titre", "Portions", "Ingrédients", "Étapes", "Source"] as const;
type F2Header = (typeof F2_HEADERS)[number];

/** En-tête F2 en ligne seule (contrat wire + compat ancien). */
const F2_HEADER_LINE_RE = /^(Titre|Portions|Ingrédients|Étapes|Source)\s*:\s*$/;

/** Ligne portions nouveau wire : `6 portions` / `1 portion` / `6,5 portions`. */
const F2_PORTIONS_LINE_RE = /^\d+(?:[.,]\d+)?\s*portions?\s*$/i;

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Portions sur une ligne (`6 portions` / `6,5 portions`) ; `null` si absentes. Pas d’arrondi. */
export function formatShareServingsLine(servings?: number | null): string | null {
  if (servings === undefined || servings === null || !Number.isFinite(servings) || servings <= 0) {
    return null;
  }
  if (servings === 1) {
    return "1 portion";
  }
  if (Number.isInteger(servings)) {
    return `${servings} portions`;
  }
  return `${String(servings).replace(".", ",")} portions`;
}

/** Portions visibles sur le détail (après scaling appliqué) ; sinon base. */
export function displayedServingsForShare(recipe: Recipe): number | undefined {
  return resolveDisplayedServings(recipe);
}

/** Ligne d’ingrédient lisible hors app : quantité affichée + unité + libellé ; sinon rawText. */
export function formatIngredientLineForShare(ingredient: IngredientLine): string {
  const label = ingredient.label?.trim() ?? "";
  const qty = ingredient.quantity;
  const unit = ingredient.unit?.trim() ?? "";
  const hasDisplayedQty = qty !== undefined && qty !== null && !Number.isNaN(Number(qty));

  if (hasDisplayedQty) {
    const parts: string[] = [String(qty)];
    if (unit) {
      parts.push(unit);
    }
    if (label) {
      parts.push(label);
    }
    return parts.join(" ").trim() || label;
  }

  const raw = ingredient.rawText?.trim();
  if (raw) {
    return raw;
  }

  return label;
}

function sortedIngredients(recipe: Recipe): IngredientLine[] {
  return [...recipe.ingredients].sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) {
      return ao - bo;
    }
    return 0;
  });
}

function sortedSteps(recipe: Recipe): InstructionStep[] {
  return [...recipe.steps].sort((a, b) => a.order - b.order);
}

function block(header: "Ingrédients" | "Étapes" | "Source", bodyLines: string[]): string {
  if (bodyLines.length === 0) {
    return `${header}:`;
  }
  return [`${header}:`, ...bodyLines].join("\n");
}

/**
 * Sérialise une recette au wire F2 (partage natif).
 * L1 = titre nu ; ligne optionnelle `N portions` (= affichage détail) ;
 * quantités = celles affichées ; omet Source si absente ; CTA toujours en dernière ligne.
 * Ne mute pas `servingsBase` / `quantityBase`.
 */
export function buildRecipeShareF2Text(recipe: Recipe): string {
  const title = recipe.title?.trim() || "Sans titre";
  const head: string[] = [title];
  const servingsLine = formatShareServingsLine(displayedServingsForShare(recipe));
  if (servingsLine) {
    head.push(servingsLine);
  }

  const blocks: string[] = [];

  const ingredientLines = sortedIngredients(recipe)
    .map((ing) => formatIngredientLineForShare(ing))
    .filter((line) => line.length > 0)
    .map((line) => (line.startsWith("- ") ? line : `- ${line}`));
  blocks.push(block("Ingrédients", ingredientLines));

  const stepLines = sortedSteps(recipe)
    .map((step) => step.text?.trim() ?? "")
    .filter((text) => text.length > 0)
    .map((text, index) => {
      const numbered = /^\d+[.)]\s*/.test(text) ? text : `${index + 1}. ${text}`;
      return numbered;
    });
  blocks.push(block("Étapes", stepLines));

  const sourceUrl = recipe.source?.url?.trim();
  if (sourceUrl && isHttpUrl(sourceUrl)) {
    blocks.push(block("Source", [sourceUrl]));
  }

  return `${head.join("\n")}\n\n${blocks.join("\n\n")}\n\n${RECIPE_SHARE_F2_CTA}`;
}

function newId(): string {
  return crypto.randomUUID();
}

function stripIngredientPrefix(line: string): string {
  return line.replace(/^-\s+/, "").trim();
}

function stripStepNumbering(line: string): string {
  return line.replace(/^\d+[.)]\s*/, "").trim();
}

function parsePortionsNumber(raw: string): number | undefined {
  const match = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*portions?\s*$/i);
  const candidate = match ? match[1]! : raw.trim().replace(",", ".");
  const parsed = Number(candidate.replace(",", "."));
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return undefined;
}

/**
 * Parse inverse du wire F2. Retourne un draft utilisable ou `null` si non-F2 / incomplet.
 * Accepte le nouveau wire (titre nu + `N portions`) et l’ancien (`Titre:` / `Portions:`).
 * Ignore la ligne CTA exacte ; ne déclenche jamais d’import URL sur le CTA.
 */
export function tryParseRecipeShareF2Text(
  text: string,
  options?: { sourceType?: ImportType }
): ParsedRecipeDraft | null {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const sections = new Map<F2Header, string[]>();
  const preamble: string[] = [];
  let current: F2Header | null = null;
  let sawHeader = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (
      line === RECIPE_SHARE_F2_CTA ||
      trimmedLine === RECIPE_SHARE_F2_CTA ||
      line === RECIPE_SHARE_F2_CTA_LEGACY ||
      trimmedLine === RECIPE_SHARE_F2_CTA_LEGACY
    ) {
      continue;
    }

    const headerMatch = line.match(F2_HEADER_LINE_RE);
    if (headerMatch) {
      sawHeader = true;
      current = headerMatch[1] as F2Header;
      if (!sections.has(current)) {
        sections.set(current, []);
      }
      continue;
    }

    if (current) {
      sections.get(current)!.push(line);
    } else {
      preamble.push(line);
    }
  }

  if (!sawHeader) {
    return null;
  }

  let title = (sections.get("Titre") ?? [])
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(" ")
    .trim();

  let servingsBase: number | undefined;
  const portionsBody = (sections.get("Portions") ?? [])
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (portionsBody.length > 0) {
    servingsBase = parsePortionsNumber(portionsBody[0]!);
  }

  if (!title) {
    for (const raw of preamble) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      if (F2_PORTIONS_LINE_RE.test(trimmed)) {
        continue;
      }
      title = trimmed;
      break;
    }
  }

  // Portions nouveau wire dans le préambule (même si titre vient déjà de `Titre:`)
  if (servingsBase === undefined) {
    for (const raw of preamble) {
      const trimmed = raw.trim();
      if (F2_PORTIONS_LINE_RE.test(trimmed)) {
        servingsBase = parsePortionsNumber(trimmed);
        break;
      }
    }
  }

  if (!title) {
    return null;
  }

  const ingredients: IngredientLine[] = [];
  for (const raw of sections.get("Ingrédients") ?? []) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const body = stripIngredientPrefix(trimmed);
    if (!body) continue;
    ingredients.push({
      id: newId(),
      order: ingredients.length + 1,
      label: body,
      isScalable: false,
      rawText: body
    });
  }

  const steps: ParsedInstructionStep[] = [];
  for (const raw of sections.get("Étapes") ?? []) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const body = stripStepNumbering(trimmed);
    if (!body) continue;
    steps.push({
      id: newId(),
      order: steps.length + 1,
      text: body
    });
  }

  if (ingredients.length === 0 && steps.length === 0) {
    return null;
  }

  let sourceUrl: string | undefined;
  for (const raw of sections.get("Source") ?? []) {
    const candidate = raw.trim();
    if (candidate && isHttpUrl(candidate)) {
      sourceUrl = candidate;
      break;
    }
  }

  const draft: ParsedRecipeDraft = {
    title,
    category: "SALE",
    ingredients,
    steps,
    source: {
      type: options?.sourceType ?? "TEXT",
      url: sourceUrl,
      capturedAt: new Date().toISOString()
    }
  };
  if (servingsBase !== undefined) {
    draft.servingsBase = servingsBase;
  }
  return draft;
}
