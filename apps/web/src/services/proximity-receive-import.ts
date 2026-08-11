import type {
  IngredientLine,
  InstructionStep,
  ParsedRecipeDraft,
  Recipe
} from "@cookies-et-coquilettes/domain";
import { resolveImportSourceStableKey } from "@cookies-et-coquilettes/domain";
import type { ProximityParseResult } from "./proximity-deep-link-core";

/** Résultat du seam Mode A post-confirm (AD-17) — sans UI. */
export type ProximityModeAImportResult =
  | { status: "created"; recipe: Recipe; draft: ParsedRecipeDraft }
  | { status: "skipped"; importSourceStableKey: string };

export type ImportProximityModeADeps = {
  importFromUrl: (url: string) => Promise<ParsedRecipeDraft>;
  listRecipes: () => Promise<Array<Pick<Recipe, "importSourceStableKey">>>;
  createRecipe: (recipe: Recipe) => Promise<void>;
  now?: () => string;
  newId?: () => string;
};

/** Branchement post-Confirmer (hors Annuler) : Mode A import, Mode B no-op, intent invalide. */
export type ProximityPostConfirmAction = "mode-a" | "mode-b" | "invalid";

export const PARSE_FAIL_MESSAGE =
  "L'import de la recette a échoué. Vérifiez le lien ou redemandez le partage.";

/**
 * Décide le branchement App après consentement Confirmer (pas Annuler).
 * Mode B → no-op écriture (story 6) ; invalid → clear flux.
 */
export function resolveProximityPostConfirmAction(
  intent: ProximityParseResult | null | undefined
): ProximityPostConfirmAction {
  if (!intent || "ok" in intent) {
    return "invalid";
  }
  if (intent.mode === "a") {
    return "mode-a";
  }
  return "mode-b";
}

function newRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isEmptyParseDraft(draft: ParsedRecipeDraft): boolean {
  const hasIngredients = draft.ingredients.some((i) => (i.label ?? "").trim());
  const hasSteps = draft.steps.some((s) => (s.text ?? "").trim());
  return !hasIngredients && !hasSteps;
}

/**
 * Mapping draft → Recipe (sans clé) — miroir du chemin import ambiant,
 * destiné à être enrichi de `importSourceStableKey` après la gate dédup.
 */
export function buildRecipeFromProximityDraft(
  draft: ParsedRecipeDraft,
  options: {
    importSourceStableKey?: string;
    id?: string;
    now?: string;
  } = {}
): Recipe {
  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? newRandomId();

  const ingredients: IngredientLine[] = [...draft.ingredients]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((ingredient, index) => {
      const label = (ingredient.label ?? "").trim();
      return {
        id: ingredient.id || newRandomId(),
        order: index + 1,
        label,
        quantity: ingredient.quantity,
        quantityBase: ingredient.isScalable ? ingredient.quantity : undefined,
        unit: ingredient.unit?.trim() || undefined,
        isScalable: ingredient.isScalable,
        rawText: ingredient.rawText ?? label,
        imageId: ingredient.imageId
      };
    })
    .filter((ingredient) => Boolean(ingredient.label));

  const steps: InstructionStep[] = [...draft.steps]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((step, index) => {
      const text = (step.text ?? "").trim();
      return {
        id: step.id || newRandomId(),
        order: index + 1,
        text
        // médias : hydratation async côté UI (comme l’import URL ambiant)
      };
    })
    .filter((step) => Boolean(step.text));

  const source = draft.source
    ? {
        type: draft.source.type,
        url: draft.source.url?.trim() || undefined,
        capturedAt: draft.source.capturedAt
      }
    : undefined;

  const recipe: Recipe = {
    id,
    title: (draft.title ?? "").trim() || "Recette importée",
    category: draft.category ?? "SALE",
    favorite: false,
    servingsBase: draft.servingsBase,
    servingsCurrent: draft.servingsBase,
    ingredients,
    steps,
    prepTimeMin: draft.prepTimeMin,
    cookTimeMin: draft.cookTimeMin,
    restTimeMin: draft.restTimeMin,
    source,
    createdAt: now,
    updatedAt: now
  };

  if (recipe.servingsBase == null) {
    delete recipe.servingsBase;
    delete recipe.servingsCurrent;
  }

  const key = options.importSourceStableKey?.trim();
  if (key) {
    recipe.importSourceStableKey = key;
  }

  return recipe;
}

/**
 * Orchestration Mode A post-confirm (AD-17) :
 * parse URL → resolve clé → skip si connue sinon create avec clé.
 */
export async function importProximityModeAAfterConfirm(
  sourceUrl: string,
  deps: ImportProximityModeADeps
): Promise<ProximityModeAImportResult> {
  const trimmedUrl = sourceUrl.trim();
  if (!trimmedUrl) {
    throw new Error(PARSE_FAIL_MESSAGE);
  }

  const draft = await deps.importFromUrl(trimmedUrl);

  if (!Array.isArray(draft.ingredients) || !Array.isArray(draft.steps)) {
    throw new Error(PARSE_FAIL_MESSAGE);
  }

  // Fallback ambiant (ingredients/steps vides) = échec parse proximité : pas de fantôme.
  if (isEmptyParseDraft(draft)) {
    throw new Error(PARSE_FAIL_MESSAGE);
  }

  const now = deps.now?.() ?? new Date().toISOString();
  const source = {
    type: draft.source?.type ?? ("URL" as const),
    url: draft.source?.url?.trim() || trimmedUrl,
    capturedAt: draft.source?.capturedAt ?? now
  };
  const draftWithSource: ParsedRecipeDraft = { ...draft, source };

  const importSourceStableKey = await resolveImportSourceStableKey({
    source,
    importSourceStableKey: undefined
  });

  if (importSourceStableKey) {
    const existingList = await deps.listRecipes();
    const existingStableKeys = new Set(
      existingList
        .map((r) => r.importSourceStableKey?.trim())
        .filter((k): k is string => Boolean(k))
    );
    if (existingStableKeys.has(importSourceStableKey)) {
      return { status: "skipped", importSourceStableKey };
    }
  }

  const recipe = buildRecipeFromProximityDraft(draftWithSource, {
    importSourceStableKey,
    id: deps.newId?.(),
    now
  });

  await deps.createRecipe(recipe);
  return { status: "created", recipe, draft: draftWithSource };
}
