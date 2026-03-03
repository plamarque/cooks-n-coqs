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

export interface InstructionStep {
  id: string;
  order: number;
  text: string;
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
  steps: InstructionStep[];
  prepTimeMin?: number;
  cookTimeMin?: number;
  restTimeMin?: number;
  imageUrl?: string;
  source?: ImportSource;
}

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
