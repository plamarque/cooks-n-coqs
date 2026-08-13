import type { IngredientLine, InstructionStep, Recipe } from "@cookies-et-coquilettes/domain";

/** CTA soft — dernière ligne du payload F2 (hors en-têtes). */
export const RECIPE_SHARE_F2_CTA =
  "Tu veux garder cette recette ? https://plamarque.github.io/cookies-et-coquilettes/";

const F2_HEADERS = ["Titre", "Portions", "Ingrédients", "Étapes", "Source"] as const;

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
