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

export interface InstructionStep {
  id: string;
  order: number;
  text: string;
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
