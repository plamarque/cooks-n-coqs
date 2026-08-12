import type {
  IngredientLine,
  InstructionStep,
  ParsedInstructionStep,
  ParsedRecipeDraft,
  Recipe,
  RecipeCategory
} from "@cookies-et-coquilettes/domain";
import { resolveImportSourceStableKey } from "@cookies-et-coquilettes/domain";
import type { ProximityParseResult } from "./proximity-deep-link-core";
import { PROXIMITY_DROP_UNAVAILABLE_MESSAGE } from "./proximity-drop-client";

/** Résultat du seam Mode A post-confirm (AD-17) — sans UI. */
export type ProximityModeAImportResult =
  | { status: "created"; recipe: Recipe; draft: ParsedRecipeDraft }
  | { status: "skipped"; importSourceStableKey: string };

/** Résultat du seam Mode B post-confirm (AD-15/17) — sans UI. */
export type ProximityModeBImportResult =
  | { status: "created"; recipe: Recipe; draft: ParsedRecipeDraft }
  | { status: "skipped"; importSourceStableKey: string };

export type ImportProximityModeADeps = {
  importFromUrl: (url: string) => Promise<ParsedRecipeDraft>;
  listRecipes: () => Promise<Array<Pick<Recipe, "importSourceStableKey">>>;
  createRecipe: (recipe: Recipe) => Promise<void>;
  now?: () => string;
  newId?: () => string;
};

export type ImportProximityModeBDeps = {
  consumeDrop: (ticketId: string) => Promise<unknown>;
  listRecipes: () => Promise<Array<Pick<Recipe, "importSourceStableKey">>>;
  createRecipe: (recipe: Recipe) => Promise<void>;
  now?: () => string;
  newId?: () => string;
};

/** Branchement post-Confirmer (hors Annuler) : Mode A / Mode B / intent invalide. */
export type ProximityPostConfirmAction = "mode-a" | "mode-b" | "invalid";

export const PARSE_FAIL_MESSAGE =
  "L'import de la recette a échoué. Vérifiez le lien ou redemandez le partage.";

/** Aligné CAP-7 indisponible (payload burn inutilisable). */
export const MODE_B_PAYLOAD_INVALID_MESSAGE = PROXIMITY_DROP_UNAVAILABLE_MESSAGE;

export const MODE_B_RETRY_WITHOUT_PAYLOAD_MESSAGE =
  "Impossible de réessayer l'import : le contenu du partage n'est plus en mémoire.";

/** Payload brûlé retenu pour retry create sans 2ᵉ GET (AD-15). */
let retainedModeBDraft: ParsedRecipeDraft | null = null;

/**
 * Décide le branchement App après consentement Confirmer (pas Annuler).
 * Mode B → consume + create (story 6) ; invalid → clear flux.
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

/** Test / reset : vide la rétention mémoire Mode B. */
export function clearProximityModeBRetainedPayload(): void {
  retainedModeBDraft = null;
}

/** Expose le draft retenu (tests) — `null` si aucun burn réussi. */
export function getProximityModeBRetainedPayload(): ParsedRecipeDraft | null {
  return retainedModeBDraft;
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
 * `remintLineIds` : force des ids Bob (Mode B) même si le draft porte des ids.
 */
export function buildRecipeFromProximityDraft(
  draft: ParsedRecipeDraft,
  options: {
    importSourceStableKey?: string;
    id?: string;
    now?: string;
    remintLineIds?: boolean;
  } = {}
): Recipe {
  const now = options.now ?? new Date().toISOString();
  const id = options.id ?? newRandomId();
  const remint = Boolean(options.remintLineIds);

  const ingredients: IngredientLine[] = [...draft.ingredients]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((ingredient, index) => {
      const label = (ingredient.label ?? "").trim();
      const line: IngredientLine = {
        id: remint || !ingredient.id ? newRandomId() : ingredient.id,
        order: index + 1,
        label,
        quantity: ingredient.quantity,
        quantityBase: ingredient.isScalable ? ingredient.quantity : undefined,
        unit: ingredient.unit?.trim() || undefined,
        isScalable: ingredient.isScalable,
        rawText: ingredient.rawText ?? label
      };
      // Mode B : pas de blobs Alice ; Mode A peut garder imageId draft si présent.
      if (!remint && ingredient.imageId) {
        line.imageId = ingredient.imageId;
      }
      return line;
    })
    .filter((ingredient) => Boolean(ingredient.label));

  const steps: InstructionStep[] = [...draft.steps]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((step, index) => {
      const text = (step.text ?? "").trim();
      return {
        id: remint || !step.id ? newRandomId() : step.id,
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

function isRecipeCategory(value: unknown): value is RecipeCategory {
  return value === "SUCRE" || value === "SALE";
}

/**
 * Mappe le payload burn JSON → draft soft (sans ids Alice / blobs).
 */
export function parseProximityModeBPayload(payload: unknown): ParsedRecipeDraft {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(MODE_B_PAYLOAD_INVALID_MESSAGE);
  }

  const raw = payload as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) {
    throw new Error(MODE_B_PAYLOAD_INVALID_MESSAGE);
  }

  const rawIngredients = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];

  const ingredients: IngredientLine[] = rawIngredients
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const row = item as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label.trim() : "";
      if (!label) {
        return null;
      }
      const line: IngredientLine = {
        id: "",
        order:
          typeof row.order === "number" && Number.isFinite(row.order) ? row.order : index + 1,
        label,
        isScalable: row.isScalable === true,
        rawText: typeof row.rawText === "string" ? row.rawText : label
      };
      if (typeof row.quantity === "number" && Number.isFinite(row.quantity)) {
        line.quantity = row.quantity;
      } else if (typeof row.quantity === "string" && row.quantity.trim()) {
        const parsedQuantity = Number(row.quantity);
        if (Number.isFinite(parsedQuantity)) {
          line.quantity = parsedQuantity;
        }
      }
      if (typeof row.unit === "string" && row.unit.trim()) {
        line.unit = row.unit.trim();
      }
      return line;
    })
    .filter((line): line is IngredientLine => line != null);

  const steps: ParsedInstructionStep[] = rawSteps
    .map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const row = item as Record<string, unknown>;
      const text = typeof row.text === "string" ? row.text.trim() : "";
      if (!text) {
        return null;
      }
      return {
        id: "",
        order:
          typeof row.order === "number" && Number.isFinite(row.order) ? row.order : index + 1,
        text
      };
    })
    .filter((step): step is ParsedInstructionStep => step != null);

  const draft: ParsedRecipeDraft = {
    title,
    category: isRecipeCategory(raw.category) ? raw.category : "SALE",
    ingredients,
    steps
  };

  if (typeof raw.servingsBase === "number" && Number.isFinite(raw.servingsBase)) {
    draft.servingsBase = raw.servingsBase;
  }
  if (typeof raw.prepTimeMin === "number" && Number.isFinite(raw.prepTimeMin)) {
    draft.prepTimeMin = raw.prepTimeMin;
  }
  if (typeof raw.cookTimeMin === "number" && Number.isFinite(raw.cookTimeMin)) {
    draft.cookTimeMin = raw.cookTimeMin;
  }
  if (typeof raw.restTimeMin === "number" && Number.isFinite(raw.restTimeMin)) {
    draft.restTimeMin = raw.restTimeMin;
  }

  if (raw.source && typeof raw.source === "object" && !Array.isArray(raw.source)) {
    const source = raw.source as Record<string, unknown>;
    const type =
      source.type === "MANUAL" ||
      source.type === "SHARE" ||
      source.type === "URL" ||
      source.type === "SCREENSHOT" ||
      source.type === "TEXT"
        ? source.type
        : "MANUAL";
    const capturedAt =
      typeof source.capturedAt === "string" && source.capturedAt.trim()
        ? source.capturedAt
        : new Date().toISOString();
    draft.source = {
      type,
      capturedAt,
      ...(typeof source.url === "string" && source.url.trim()
        ? { url: source.url.trim() }
        : {})
    };
  }

  return draft;
}

async function completeModeBImportFromDraft(
  draft: ParsedRecipeDraft,
  deps: Omit<ImportProximityModeBDeps, "consumeDrop">
): Promise<ProximityModeBImportResult> {
  const now = deps.now?.() ?? new Date().toISOString();

  const importSourceStableKey = await resolveImportSourceStableKey({
    source: draft.source,
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
      retainedModeBDraft = null;
      return { status: "skipped", importSourceStableKey };
    }
  }

  const recipe = buildRecipeFromProximityDraft(draft, {
    importSourceStableKey,
    id: deps.newId?.(),
    now,
    remintLineIds: true
  });

  await deps.createRecipe(recipe);
  retainedModeBDraft = null;
  return { status: "created", recipe, draft };
}

/**
 * Orchestration Mode B post-confirm (AD-15/17) :
 * GET burn once → retain → AD-13 si clé/URL sinon create (Bob ids).
 * En cas d’échec create, le payload reste en mémoire pour retry (pas de 2ᵉ GET).
 */
export async function importProximityModeBAfterConfirm(
  ticketId: string,
  deps: ImportProximityModeBDeps
): Promise<ProximityModeBImportResult> {
  const trimmed = ticketId.trim();
  if (!trimmed) {
    throw new Error(MODE_B_PAYLOAD_INVALID_MESSAGE);
  }

  const payload = await deps.consumeDrop(trimmed);
  const draft = parseProximityModeBPayload(payload);
  if (isEmptyParseDraft(draft)) {
    throw new Error(MODE_B_PAYLOAD_INVALID_MESSAGE);
  }
  retainedModeBDraft = draft;

  try {
    return await completeModeBImportFromDraft(draft, deps);
  } catch (error) {
    // Conserve retainedModeBDraft pour retry sans second GET.
    throw error;
  }
}

/**
 * Retry create depuis le payload brûlé en mémoire (AD-15) — aucun GET.
 */
export async function retryProximityModeBCreateFromMemory(
  deps: Omit<ImportProximityModeBDeps, "consumeDrop">
): Promise<ProximityModeBImportResult> {
  if (!retainedModeBDraft) {
    throw new Error(MODE_B_RETRY_WITHOUT_PAYLOAD_MESSAGE);
  }
  return completeModeBImportFromDraft(retainedModeBDraft, deps);
}
