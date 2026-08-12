import type {
  IngredientLine,
  InstructionStep,
  ParsedInstructionStep,
  ParsedRecipeDraft,
  Recipe
} from "@cookies-et-coquilettes/domain";

/**
 * Envelope Mode B (AD-17) : draft soft ParsedRecipeDraft-compatible.
 * Pas d’ids durables Alice, pas de blobs / imageId / sourceImageIds requis.
 * Quantités = base de capture (`quantityBase` si présent) aux servings de capture.
 */
export function recipeToProximityDropEnvelope(recipe: Recipe): ParsedRecipeDraft {
  const title = (recipe.title ?? "").trim();
  if (!title) {
    throw new Error("La recette doit avoir un titre pour être partagée.");
  }

  const ingredients: IngredientLine[] = [...recipe.ingredients]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((ingredient, index) => {
      const label = (ingredient.label ?? "").trim();
      const quantity =
        ingredient.isScalable && ingredient.quantityBase != null
          ? ingredient.quantityBase
          : ingredient.quantity;

      const line: IngredientLine = {
        id: "",
        order: index + 1,
        label,
        isScalable: Boolean(ingredient.isScalable),
        rawText: ingredient.rawText ?? label
      };

      if (quantity != null) {
        line.quantity = quantity;
      }
      if (ingredient.unit?.trim()) {
        line.unit = ingredient.unit.trim();
      }

      return line;
    })
    .filter((ingredient) => Boolean(ingredient.label));

  const steps: ParsedInstructionStep[] = [...recipe.steps]
    .sort((a, b) => a.order - b.order)
    .map((step: InstructionStep, index) => {
      const text = (step.text ?? "").trim();
      return {
        id: "",
        order: index + 1,
        text
        // médias non requis / non embarqués (AD-6 / AD-17)
      };
    })
    .filter((step) => Boolean(step.text));

  if (ingredients.length === 0 && steps.length === 0) {
    throw new Error("La recette n'a aucun contenu partageable.");
  }

  const draft: ParsedRecipeDraft = {
    title,
    category: recipe.category ?? "SALE",
    ingredients,
    steps
  };

  if (recipe.servingsBase != null) {
    draft.servingsBase = recipe.servingsBase;
  }
  if (recipe.prepTimeMin != null) {
    draft.prepTimeMin = recipe.prepTimeMin;
  }
  if (recipe.cookTimeMin != null) {
    draft.cookTimeMin = recipe.cookTimeMin;
  }
  if (recipe.restTimeMin != null) {
    draft.restTimeMin = recipe.restTimeMin;
  }

  if (recipe.source) {
    draft.source = {
      type: recipe.source.type,
      capturedAt: recipe.source.capturedAt,
      ...(recipe.source.url?.trim() ? { url: recipe.source.url.trim() } : {})
    };
  }

  return draft;
}

/** Sérialise l’envelope en objet JSON POST (sans ids Alice vides inutiles). */
export function proximityDropEnvelopeToPostBody(
  draft: ParsedRecipeDraft
): Record<string, unknown> {
  return {
    title: draft.title,
    category: draft.category,
    ...(draft.servingsBase != null ? { servingsBase: draft.servingsBase } : {}),
    ingredients: draft.ingredients.map(({ id: _id, imageId: _imageId, quantityBase: _qb, ...rest }) => {
      const line: Record<string, unknown> = {
        order: rest.order,
        label: rest.label,
        isScalable: rest.isScalable
      };
      if (rest.quantity != null) line.quantity = rest.quantity;
      if (rest.unit) line.unit = rest.unit;
      if (rest.rawText) line.rawText = rest.rawText;
      return line;
    }),
    steps: draft.steps.map(({ id: _id, media: _media, ...rest }) => ({
      order: rest.order,
      text: rest.text
    })),
    ...(draft.prepTimeMin != null ? { prepTimeMin: draft.prepTimeMin } : {}),
    ...(draft.cookTimeMin != null ? { cookTimeMin: draft.cookTimeMin } : {}),
    ...(draft.restTimeMin != null ? { restTimeMin: draft.restTimeMin } : {}),
    ...(draft.source ? { source: draft.source } : {})
  };
}
