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

/** Blob privé d'un fil Chef, distinct des images d'une Recipe du Cahier. */
export interface ChefConversationAsset {
  id: string;
  conversationId: string;
  turnId: string;
  order: number;
  name?: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  blob: Blob;
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
  chefConversationAssets!: Table<ChefConversationAsset, string>;

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
    this.version(5).stores({
      recipes: "id, category, favorite, updatedAt",
      images: "id, createdAt",
      ingredientImages: "id, createdAt",
      cookingStepImages: "id, recipeId, [recipeId+stepId], createdAt",
      chefConversations: "id, createdAt, closedAt",
      chefConversationAssets: "id, conversationId, turnId, [conversationId+turnId+order], createdAt"
    });
  }

  async findLastResumableChefConversation(): Promise<ChefConversationResume> {
    return selectLastResumableChefConversation(await this.chefConversations.toArray());
  }
}

export const db = new RecipesDatabase();

/**
 * Écrit le tour et ses photos dans la même transaction. Ainsi une erreur ne
 * vide pas le Compositeur et ne laisse aucun journal partiel.
 */
export async function storeChefConversationAssets(
  conversation: ChefConversationRecord,
  turnId: string,
  files: readonly File[]
): Promise<ChefConversationRecord> {
  const rows: ChefConversationAsset[] = files.map((file, order) => ({
    id: crypto.randomUUID(), conversationId: conversation.id, turnId, order,
    name: file.name || undefined, mimeType: file.type, sizeBytes: file.size,
    createdAt: new Date().toISOString(), blob: file
  }));
  const next: ChefConversationRecord = {
    ...conversation,
    turns: conversation.turns.map((turn) => turn.id !== turnId ? { ...turn } : {
      ...turn,
      ...(rows.length ? { attachments: rows.map(({ id, order, name, mimeType }) => ({ assetId: id, order, ...(name ? { name } : {}), mimeType })) } : {})
    })
  };
  await db.transaction("rw", db.chefConversations, db.chefConversationAssets, async () => {
    if (rows.length) await db.chefConversationAssets.bulkAdd(rows);
    await db.chefConversations.put(next);
  });
  return next;
}

export async function getChefConversationAssetBlobUrl(assetId: string): Promise<string | undefined> {
  const asset = await db.chefConversationAssets.get(assetId);
  return asset?.blob ? URL.createObjectURL(asset.blob) : undefined;
}
