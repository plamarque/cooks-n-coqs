import type {
  ImportType,
  IngredientLine,
  InstructionStep,
  ParsedInstructionStep,
  ParsedRecipeDraft,
  Recipe
} from "@cookies-et-coquilettes/domain";

/** CTA soft — dernière ligne du payload F2 (hors en-têtes). */
export const RECIPE_SHARE_F2_CTA =
  "Tu veux garder cette recette ? https://plamarque.github.io/cookies-et-coquilettes/";

const F2_HEADERS = ["Titre", "Portions", "Ingrédients", "Étapes", "Source"] as const;

/** En-tête F2 en ligne seule (contrat wire). */
const F2_HEADER_LINE_RE = /^(Titre|Portions|Ingrédients|Étapes|Source)\s*:\s*$/;

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Ligne d’ingrédient lisible hors app (quantité + unité + libellé, ou rawText). */
export function formatIngredientLineForShare(ingredient: IngredientLine): string {
  const raw = ingredient.rawText?.trim();
  if (raw) {
    return raw;
  }

  const label = ingredient.label?.trim() ?? "";
  const qty =
    ingredient.quantity ??
    (ingredient.quantityBase !== undefined ? ingredient.quantityBase : undefined);
  const unit = ingredient.unit?.trim() ?? "";

  const parts: string[] = [];
  if (qty !== undefined && qty !== null && !Number.isNaN(Number(qty))) {
    parts.push(String(qty));
  }
  if (unit) {
    parts.push(unit);
  }
  if (label) {
    parts.push(label);
  }
  return parts.join(" ").trim() || label;
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

function block(header: (typeof F2_HEADERS)[number], bodyLines: string[]): string {
  if (bodyLines.length === 0) {
    return `${header}:`;
  }
  return [`${header}:`, ...bodyLines].join("\n");
}

/**
 * Sérialise une recette au wire F2 (partage natif).
 * Omet Portions / Source si absents ; CTA toujours en dernière ligne.
 */
export function buildRecipeShareF2Text(recipe: Recipe): string {
  const title = recipe.title?.trim() || "Sans titre";
  const blocks: string[] = [block("Titre", [title])];

  const servings = recipe.servingsBase;
  if (servings !== undefined && servings !== null && Number.isFinite(servings) && servings > 0) {
    blocks.push(block("Portions", [String(servings)]));
  }

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

  return `${blocks.join("\n\n")}\n\n${RECIPE_SHARE_F2_CTA}`;
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

/**
 * Parse inverse du wire F2. Retourne un draft utilisable ou `null` si non-F2 / incomplet.
 * Ignore la ligne CTA exacte ; ne déclenche jamais d’import URL sur le CTA.
 */
export function tryParseRecipeShareF2Text(
  text: string,
  options?: { sourceType?: ImportType }
): ParsedRecipeDraft | null {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const sections = new Map<(typeof F2_HEADERS)[number], string[]>();
  let current: (typeof F2_HEADERS)[number] | null = null;
  let sawHeader = false;

  for (const line of lines) {
    if (line === RECIPE_SHARE_F2_CTA || line.trim() === RECIPE_SHARE_F2_CTA) {
      continue;
    }

    const headerMatch = line.match(F2_HEADER_LINE_RE);
    if (headerMatch) {
      sawHeader = true;
      current = headerMatch[1] as (typeof F2_HEADERS)[number];
      if (!sections.has(current)) {
        sections.set(current, []);
      }
      continue;
    }

    if (current) {
      sections.get(current)!.push(line);
    }
  }

  if (!sawHeader) {
    return null;
  }

  const title = (sections.get("Titre") ?? [])
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(" ")
    .trim();
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

  let servingsBase: number | undefined;
  const portionsBody = (sections.get("Portions") ?? [])
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (portionsBody.length > 0) {
    const parsed = Number(portionsBody[0].replace(",", "."));
    if (Number.isFinite(parsed) && parsed > 0) {
      servingsBase = parsed;
    }
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
