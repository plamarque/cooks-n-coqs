import type { IngredientLine, InstructionStep } from "@cookies-et-coquilettes/domain";

const INGREDIENT_TOKEN_STOPWORDS = new Set([
  "de",
  "du",
  "des",
  "le",
  "la",
  "les",
  "au",
  "aux",
  "un",
  "une",
  "et",
  "ou",
  "a",
  "avec",
  "pour"
]);

export function normalizeForIngredientMatching(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractIngredientSearchTerms(label: string): string[] {
  const normalizedLabel = normalizeForIngredientMatching(label);
  if (!normalizedLabel) {
    return [];
  }

  const labelTokens = normalizedLabel
    .split(" ")
    .filter((token) => token.length >= 3 && !INGREDIENT_TOKEN_STOPWORDS.has(token));
  return Array.from(new Set([normalizedLabel, ...labelTokens]));
}

export function stepMentionsIngredient(
  stepTextNormalized: string,
  ingredientLabel: string
): boolean {
  const terms = extractIngredientSearchTerms(ingredientLabel);
  if (terms.length === 0 || !stepTextNormalized) {
    return false;
  }

  return terms.some((term) => {
    if (term.includes(" ")) {
      return stepTextNormalized.includes(term);
    }
    const pluralSuffix = term.endsWith("s") || term.endsWith("x") ? "" : "(?:s|x)?";
    const tokenPattern = new RegExp(
      `(^|[^a-z0-9])${escapeRegExp(term)}${pluralSuffix}([^a-z0-9]|$)`
    );
    return tokenPattern.test(stepTextNormalized);
  });
}

/**
 * Attache `ingredientIds` (+ boundText) pour le formulaire d’import/édition :
 * ne conserve que les ids présents dans `validIngredientIds` (trim inclus).
 */
export function withBoundIngredientIdsForForm<
  T extends { text: string; ingredientIds?: string[] }
>(
  step: T,
  validIngredientIds: Set<string>
): T & { ingredientIdsBoundText?: string } {
  const filtered =
    step.ingredientIds
      ?.map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter((id) => id && validIngredientIds.has(id)) ?? [];
  if (filtered.length === 0) {
    if (!step.ingredientIds?.length) return step;
    const { ingredientIds: _drop, ...rest } = step;
    return rest as T;
  }
  return {
    ...step,
    ingredientIds: filtered,
    ingredientIdsBoundText: step.text
  };
}

/** Matching tokens live (fallback UI quand `ingredientIds` absents / vides). */
export function getMentionedIngredientsForStepByTokens(
  step: { text?: string | null },
  ingredients: IngredientLine[]
): IngredientLine[] {
  const normalized = normalizeForIngredientMatching(step.text ?? "");
  if (!normalized) return [];
  return [...ingredients]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((ing) => stepMentionsIngredient(normalized, ing.label));
}

/**
 * Préfère les `ingredientIds` persistés (import BFF) ; sinon matching tokens.
 */
export function resolveMentionedIngredientsForStep(
  step: { text: string; ingredientIds?: string[] },
  ingredients: IngredientLine[]
): IngredientLine[] {
  const sorted = [...ingredients].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const ids = step.ingredientIds?.filter((id) => typeof id === "string" && id) ?? [];
  if (ids.length > 0) {
    const byId = new Map(sorted.map((ing) => [ing.id, ing]));
    const fromIds: IngredientLine[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      const ing = byId.get(id);
      if (!ing) continue;
      seen.add(id);
      fromIds.push(ing);
    }
    if (fromIds.length > 0) return fromIds;
  }
  return getMentionedIngredientsForStepByTokens(step, sorted);
}

/** Remappe les `ingredientIds` d’étapes après remint d’ids d’ingrédients. */
export function remapStepIngredientIds<T extends { ingredientIds?: string[] }>(
  steps: T[],
  ingredientIdMap: Map<string, string>
): T[] {
  if (ingredientIdMap.size === 0) return steps;
  return steps.map((step) => {
    if (!step.ingredientIds?.length) return step;
    const next: string[] = [];
    const seen = new Set<string>();
    for (const id of step.ingredientIds) {
      const mapped = ingredientIdMap.get(id) ?? id;
      if (seen.has(mapped)) continue;
      seen.add(mapped);
      next.push(mapped);
    }
    if (next.length === 0) {
      const { ingredientIds: _drop, ...rest } = step;
      return rest as T;
    }
    return { ...step, ingredientIds: next };
  });
}

/** Retire les `ingredientIds` absents du set d’ingrédients restants. */
export function filterStepIngredientIdsToKnown<T extends { ingredientIds?: string[] }>(
  steps: T[],
  validIngredientIds: Set<string>
): T[] {
  return steps.map((step) => {
    if (!step.ingredientIds?.length) return step;
    const next = step.ingredientIds.filter((id) => validIngredientIds.has(id));
    if (next.length === 0) {
      const { ingredientIds: _drop, ...rest } = step;
      return rest as T;
    }
    if (next.length === step.ingredientIds.length) return step;
    return { ...step, ingredientIds: next };
  });
}

export function ingredientIdSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

/**
 * Conserve ou efface les `ingredientIds` à la sauvegarde :
 * - texte ≠ `ingredientIdsBoundText` (baseline import / CREATE) → clear
 * - texte changé vs étape existante (EDIT) → clear
 * - ensemble d’ids ingrédients changé (existing ou baseline import) → clear
 * - sinon conserve (filtrés aux ids encore présents)
 */
export function ingredientIdsForStepSave(
  step: {
    id: string;
    text: string;
    ingredientIds?: string[];
    ingredientIdsBoundText?: string;
  },
  currentIngredientIds: Set<string>,
  options: {
    existing?: {
      steps: InstructionStep[];
      ingredients: IngredientLine[];
    };
    importedIngredientIdsBaseline?: string[];
  } = {}
): string[] | undefined {
  const raw =
    step.ingredientIds
      ?.map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean) ?? [];
  if (raw.length === 0) return undefined;

  const { existing, importedIngredientIdsBaseline } = options;

  if (importedIngredientIdsBaseline) {
    const baseline = new Set(importedIngredientIdsBaseline.filter(Boolean));
    if (!ingredientIdSetsEqual(baseline, currentIngredientIds)) {
      return undefined;
    }
  }

  if (existing && ingredientsEnsembleChanged(existing.ingredients, currentIngredientIds)) {
    return undefined;
  }

  if (typeof step.ingredientIdsBoundText === "string") {
    if (step.ingredientIdsBoundText.trim() !== step.text.trim()) {
      return undefined;
    }
  } else {
    const existingStep = existing?.steps.find((s) => s.id === step.id);
    if (existingStep && existingStep.text.trim() !== step.text.trim()) {
      return undefined;
    }
  }

  const filtered = raw.filter((id) => currentIngredientIds.has(id));
  return filtered.length > 0 ? filtered : undefined;
}

export function ingredientsEnsembleChanged(
  previous: IngredientLine[] | undefined,
  currentIds: Set<string>
): boolean {
  if (!previous) return false;
  const prevIds = new Set(previous.map((i) => i.id).filter(Boolean));
  return !ingredientIdSetsEqual(prevIds, currentIds);
}
