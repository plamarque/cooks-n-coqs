import Dexie, { type Table } from "dexie";
import type { IngredientImage, Recipe, RecipeImage } from "@cookies-et-coquilettes/domain";

export interface CookingStepImage {
  id: string;
  recipeId: string;
  stepId: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export class RecipesDatabase extends Dexie {
  recipes!: Table<Recipe, string>;
  images!: Table<RecipeImage & { blob: Blob }, string>;
  ingredientImages!: Table<IngredientImage & { blob: Blob }, string>;
  cookingStepImages!: Table<CookingStepImage & { blob: Blob }, string>;

  constructor() {
    super("cookies-et-coquilettes");
    this.version(3).stores({
      recipes: "id, category, favorite, updatedAt",
      images: "id, createdAt",
      ingredientImages: "id, createdAt",
      cookingStepImages: "id, recipeId, [recipeId+stepId], createdAt"
    });
  }
}

export const db = new RecipesDatabase();
