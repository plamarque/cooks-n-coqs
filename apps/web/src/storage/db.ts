import Dexie, { type Table } from "dexie";
import type { ChefConversationRecord } from "../utils/chef-session";
import { isChefConversation, type IngredientImage, type Recipe, type RecipeImage } from "@cookies-et-coquilettes/domain";

export interface CookingStepImage {
  id: string;
  recipeId: string;
  stepId: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** Ignore les lignes legacy ou corrompues sans jamais les modifier. */
export type ChefConversationResume =
  | { kind: "available"; conversation: ChefConversationRecord }
  | { kind: "none" }
  | { kind: "unavailable" };

export function selectLastResumableChefConversation(records: readonly unknown[]): ChefConversationResume {
  const conversations = records.filter(isChefConversation)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  if (conversations[0]) return { kind: "available", conversation: conversations[0] };
  return records.length ? { kind: "unavailable" } : { kind: "none" };
}

export class RecipesDatabase extends Dexie {
  recipes!: Table<Recipe, string>;
  images!: Table<RecipeImage & { blob: Blob }, string>;
  ingredientImages!: Table<IngredientImage & { blob: Blob }, string>;
  cookingStepImages!: Table<CookingStepImage & { blob: Blob }, string>;
  chefConversations!: Table<ChefConversationRecord, string>;

  constructor() {
    super("cookies-et-coquilettes");
    this.version(3).stores({
      recipes: "id, category, favorite, updatedAt",
      images: "id, createdAt",
      ingredientImages: "id, createdAt",
      cookingStepImages: "id, recipeId, [recipeId+stepId], createdAt"
    });
    this.version(4).stores({
      recipes: "id, category, favorite, updatedAt",
      images: "id, createdAt",
      ingredientImages: "id, createdAt",
      cookingStepImages: "id, recipeId, [recipeId+stepId], createdAt",
      chefConversations: "id, createdAt, closedAt"
    });
  }

  async findLastResumableChefConversation(): Promise<ChefConversationResume> {
    return selectLastResumableChefConversation(await this.chefConversations.toArray());
  }
}

export const db = new RecipesDatabase();
