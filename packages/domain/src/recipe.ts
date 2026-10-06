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
  /**
   * Identifiant local optionnel. Les anciens journaux texte n'en ont pas ; les
   * nouveaux s'en servent pour rattacher des assets IndexedDB au bon tour.
   */
  id?: string;
  attachments?: ChefConversationAssetRef[];
  cards?: ChefConversationCard[];
}

/** Référence sérialisable à un blob du journal Chef (jamais une URL blob). */
export interface ChefConversationAssetRef {
  assetId: string;
  order: number;
  name?: string;
  mimeType: string;
}

/** Snapshot persistant de la preview : le contenu du draft, sans File ni URL objet. */
export interface AssistantPreviewSnapshot {
  draft: ParsedRecipeDraft;
  source?: ImportSource;
}

/** Une carte est soit une preview locale, soit la référence d'une Recipe du Cahier. */
export type ChefConversationCard =
  | { kind: "preview"; preview: AssistantPreviewSnapshot }
  | { kind: "candidate"; recipeId: string };

/** Journal local Chef. Les champs riches restent facultatifs pour lire v4. */
export interface ChefConversation {
  id: string;
  createdAt: string;
  closedAt?: string;
  turns: AssistantConversationTurnV1[];
}

export function isChefConversation(value: unknown): value is ChefConversation {
  if (!value || typeof value !== "object") return false;
  const conversation = value as Record<string, unknown>;
  if (typeof conversation.id !== "string" || !conversation.id || typeof conversation.createdAt !== "string" || Number.isNaN(Date.parse(conversation.createdAt))) return false;
  if (conversation.closedAt !== undefined && (typeof conversation.closedAt !== "string" || Number.isNaN(Date.parse(conversation.closedAt)))) return false;
  return Array.isArray(conversation.turns) && conversation.turns.length > 0 && conversation.turns.every((turn) => {
    if (!turn || typeof turn !== "object") return false;
    const candidate = turn as Record<string, unknown>;
    if (!((candidate.role === "user" || candidate.role === "assistant") && typeof candidate.text === "string" && candidate.text.trim().length > 0)) return false;
    if (candidate.id !== undefined && (typeof candidate.id !== "string" || !candidate.id)) return false;
    if (candidate.attachments !== undefined && (!Array.isArray(candidate.attachments) || !candidate.attachments.every(isChefConversationAssetRef))) return false;
    return candidate.cards === undefined || (Array.isArray(candidate.cards) && candidate.cards.every(isChefConversationCard));
  });
}

function isChefConversationAssetRef(value: unknown): value is ChefConversationAssetRef {
  if (!value || typeof value !== "object") return false;
  const asset = value as Record<string, unknown>;
  return typeof asset.assetId === "string" && !!asset.assetId && typeof asset.order === "number" && Number.isInteger(asset.order) && asset.order >= 0
    && typeof asset.mimeType === "string" && !!asset.mimeType
    && (asset.name === undefined || typeof asset.name === "string");
}

function isChefConversationCard(value: unknown): value is ChefConversationCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Record<string, unknown>;
  if (card.kind === "candidate") return typeof card.recipeId === "string" && !!card.recipeId;
  if (card.kind !== "preview" || !card.preview || typeof card.preview !== "object") return false;
  const preview = card.preview as Record<string, unknown>;
  return isAssistantPreviewDraft(preview.draft)
    && (preview.source === undefined || isImportSource(preview.source));
}

/** Les snapshots de preview sont relus par le formulaire : valider les champs qu'il déréférence. */
function isAssistantPreviewDraft(value: unknown): value is ParsedRecipeDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return typeof draft.title === "string" && !!draft.title.trim()
    && (draft.category === "SUCRE" || draft.category === "SALE")
    && Array.isArray(draft.ingredients)
    && Array.isArray(draft.steps);
}

function isImportSource(value: unknown): value is ImportSource {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return (source.type === "MANUAL" || source.type === "SHARE" || source.type === "URL" || source.type === "SCREENSHOT" || source.type === "TEXT")
    && typeof source.capturedAt === "string" && !Number.isNaN(Date.parse(source.capturedAt))
    && (source.url === undefined || typeof source.url === "string");
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
