/**
 * Empreinte stable du contenu partageable (overlay QR proximity).
 * Ids ignorés ; axes : url, title, servingsBase, ingrédients (dont rawText), étapes.
 */

export type ProximityShareFingerprintIngredient = {
  label?: string;
  quantity?: number | null;
  quantityBase?: number | null;
  unit?: string | null;
  order?: number | null;
  isScalable?: boolean;
  rawText?: string | null;
  /** Ignoré volontairement (pas dans l’empreinte). */
  id?: string;
};

export type ProximityShareFingerprintStep = {
  text?: string;
  order?: number;
  /** Ignoré volontairement (pas dans l’empreinte). */
  id?: string;
};

export type ProximityShareFingerprintInput = {
  title?: string | null;
  servingsBase?: number | null;
  source?: { url?: string | null } | null;
  ingredients?: ReadonlyArray<ProximityShareFingerprintIngredient> | null;
  steps?: ReadonlyArray<ProximityShareFingerprintStep> | null;
};

function normalizeIngredient(ingredient: ProximityShareFingerprintIngredient) {
  return {
    label: ingredient.label ?? "",
    quantity: ingredient.quantity ?? null,
    quantityBase: ingredient.quantityBase ?? null,
    unit: ingredient.unit ?? "",
    order: ingredient.order ?? null,
    isScalable: Boolean(ingredient.isScalable),
    rawText: ingredient.rawText ?? ""
  };
}

function normalizeStep(step: ProximityShareFingerprintStep) {
  return {
    text: step.text ?? "",
    order: step.order ?? 0
  };
}

/**
 * Clé déterministe comparable (string) pour détecter un QR stale
 * quand le contenu POSTÉ / affiché diverge pendant que l’overlay est ouvert.
 */
export function proximityShareContentFingerprint(
  recipe: ProximityShareFingerprintInput | null | undefined
): string {
  if (!recipe) {
    return JSON.stringify(null);
  }

  const ingredients = [...(recipe.ingredients ?? [])]
    .map(normalizeIngredient)
    .sort((a, b) => {
      const ao = a.order ?? Number.POSITIVE_INFINITY;
      const bo = b.order ?? Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label);
    });

  const steps = [...(recipe.steps ?? [])]
    .map(normalizeStep)
    .sort((a, b) => a.order - b.order || a.text.localeCompare(b.text));

  return JSON.stringify({
    url: recipe.source?.url ?? null,
    title: recipe.title ?? "",
    servingsBase: recipe.servingsBase ?? null,
    ingredients,
    steps
  });
}

/**
 * Décision du watch anti-stale : fermer seulement si l’overlay est ouvert,
 * qu’il existe une empreinte précédente (pas la 1ʳᵉ eval), et qu’elle a changé.
 */
export function shouldCloseProximityShareForStaleContent(options: {
  overlayVisible: boolean;
  previousFingerprint: string | undefined;
  nextFingerprint: string;
}): boolean {
  if (!options.overlayVisible || options.previousFingerprint === undefined) {
    return false;
  }
  return options.nextFingerprint !== options.previousFingerprint;
}
