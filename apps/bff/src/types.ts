export type RecipeCategory = "SUCRE" | "SALE";
export type ImportType = "MANUAL" | "SHARE" | "URL" | "SCREENSHOT" | "TEXT";

export interface IngredientLine {
  id: string;
  label: string;
  quantity?: number;
  unit?: string;
  isScalable: boolean;
  rawText?: string;
  imageId?: string;
}

export interface ImportSource {
  type: ImportType;
  url?: string;
  capturedAt: string;
}

export type StepMedium =
  | { type: "image"; imageId: string }
  | { type: "video"; url: string };

export type StepMediumDraft =
  | { type: "image"; imageUrl: string }
  | { type: "video"; url: string };

export interface InstructionStep {
  id: string;
  order: number;
  text: string;
  media?: StepMedium[];
  /** Ids d’ingrédients mentionnés (enrichis à l’import). */
  ingredientIds?: string[];
}

export interface ParsedInstructionStep {
  id: string;
  order: number;
  text: string;
  media?: StepMediumDraft[];
  /** Ids d’ingrédients mentionnés (enrichis à l’import). */
  ingredientIds?: string[];
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
