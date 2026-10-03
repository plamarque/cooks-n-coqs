export type RecipeCategory = "SUCRE" | "SALE";
export type ImportType = "MANUAL" | "SHARE" | "URL" | "SCREENSHOT" | "TEXT";

export interface IngredientLine {
  id: string;
  order?: number;
  label: string;
  quantity?: number;
  quantityBase?: number;
  unit?: string;
  isScalable: boolean;
  rawText?: string;
  imageId?: string;
}

/** Média persisté pour une étape (images en local, vidéos par URL). */
export type StepMedium =
  | { type: "image"; imageId: string }
  | { type: "video"; url: string };

/** Médias d’étape tels que renvoyés par l’import (avant téléchargement des images). */
export type StepMediumDraft =
  | { type: "image"; imageUrl: string }
  | { type: "video"; url: string };

export interface InstructionStep {
  id: string;
  order: number;
  text: string;
  /** Ordre d’affichage : images (blobs) et liens vidéo. */
  media?: StepMedium[];
  /**
   * Ids des `IngredientLine` mentionnés dans l’étape (calculés à l’import côté BFF).
   * Absent ou vide → l’UI retombe sur le matching tokens.
   */
  ingredientIds?: string[];
}

/** Étape dans un brouillon d’import (URLs d’images distantes). */
export interface ParsedInstructionStep {
  id: string;
  order: number;
  text: string;
  media?: StepMediumDraft[];
  /** Mentions étape↔ingrédient enrichies à l’import (ids des lignes du draft). */
  ingredientIds?: string[];
}

export interface ImportSource {
  type: ImportType;
  url?: string;
  capturedAt: string;
}

export interface Recipe {
  id: string;
  title: string;
  category: RecipeCategory;
  favorite: boolean;
  servingsBase?: number;
  servingsCurrent?: number;
  ingredients: IngredientLine[];
  steps: InstructionStep[];
  prepTimeMin?: number;
  cookTimeMin?: number;
  restTimeMin?: number;
  imageId?: string;
  source?: ImportSource;
  /** IDs des images sources (captures d'écran importées), consultables en vignettes */
  sourceImageIds?: string[];
  /**
   * Import cahier « léger » (sans images embarquées) : tant que vrai, le client peut
   * compléter photo / icônes / images d’étapes à la première ouverture détail (best-effort).
   * Non inclus dans l’export ZIP du cahier.
   */
  pendingBookMediaHydration?: boolean;
  /**
   * Clé opaque pour dédoublonnage à l’import cahier (ex. SHA-256 hex d’une URL source normalisée).
   * Absente si aucune source URL exploitable.
   */
  importSourceStableKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeImage {
  id: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  createdAt: string;
}

export interface IngredientImage {
  id: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  createdAt: string;
}

export interface RecipeFilters {
  category?: RecipeCategory;
  favorite?: boolean;
  search?: string;
}

export interface RecipeService {
  createRecipe(recipe: Recipe): Promise<void>;
  updateRecipe(recipeId: string, patch: Partial<Recipe>): Promise<void>;
  deleteRecipe(recipeId: string): Promise<void>;
  toggleFavorite(recipeId: string, favorite?: boolean): Promise<void>;
  listRecipes(filters?: RecipeFilters): Promise<Recipe[]>;
  scaleRecipe(recipeId: string, servings: number): Promise<Recipe>;
}

export interface ShareImportPayload {
  title?: string;
  text?: string;
  url?: string;
}

export interface ParsedRecipeDraft {
  title: string;
  category: RecipeCategory;
  servingsBase?: number;
  ingredients: IngredientLine[];
  steps: ParsedInstructionStep[];
  prepTimeMin?: number;
  cookTimeMin?: number;
  restTimeMin?: number;
  imageUrl?: string;
  source?: ImportSource;
}

/** Référence éphémère vers une recette du Cahier, valable pendant une session Assistant. */
export interface NotebookCandidateWireV1 {
  candidateRef: string;
  title: string;
  ingredientLabels: string[];
  durationMin?: number;
}

export interface NotebookSelectionRequestV1 {
  request: string;
  candidates: NotebookCandidateWireV1[];
}

export interface AssistantConversationTurnV1 {
  role: "user" | "assistant";
  text: string;
}

export type NotebookSelectionWireV1 =
  | { kind: "candidates"; candidates: Array<{ candidateRef: string; reasonCode: "RELEVANT" }> }
  | { kind: "noCandidate" }
  | { kind: "selectionUnavailable" };

/** Décode un wire fermé avant tout usage par le navigateur ou le BFF. */
export function isNotebookSelectionWireV1(value: unknown): value is NotebookSelectionWireV1 {
  if (!value || typeof value !== "object") return false;
  const wire = value as Record<string, unknown>;
  if (wire.kind === "noCandidate" || wire.kind === "selectionUnavailable") return Object.keys(wire).length === 1;
  if (wire.kind !== "candidates" || !Array.isArray(wire.candidates) || wire.candidates.length < 1 || wire.candidates.length > 3) return false;
  return Object.keys(wire).length === 2 && new Set(wire.candidates.map((candidate) => (candidate as { candidateRef?: unknown })?.candidateRef)).size === wire.candidates.length && wire.candidates.every((candidate) => {
    const entry = candidate as Record<string, unknown>;
    return !!entry && Object.keys(entry).length === 2 && typeof entry.candidateRef === "string" && /^candidate-[1-9]\d?$/.test(entry.candidateRef) && entry.reasonCode === "RELEVANT";
  });
}

/** Wire de création Assistant : le client le valide avant d'en faire une preview. */
export type AssistantDraftWireV1 = ParsedRecipeDraft;

export interface ImportService {
  importFromUrl(url: string): Promise<ParsedRecipeDraft>;
  importFromShare(payload: ShareImportPayload): Promise<ParsedRecipeDraft>;
  importFromScreenshot(file: File): Promise<ParsedRecipeDraft>;
  importFromText(text: string): Promise<ParsedRecipeDraft>;
}

export interface CookingModeSession {
  active: boolean;
  strategy: "WAKE_LOCK" | "FALLBACK";
}

export interface CookingModeService {
  startCookingMode(): Promise<CookingModeSession>;
  stopCookingMode(): Promise<void>;
}
