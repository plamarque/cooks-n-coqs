export type ChefRecipeExcerpt = { title: string; ingredients: string[]; steps: string[] };
type ChefRecipeSource = { title: string; ingredients: ReadonlyArray<{ label: string }>; steps: ReadonlyArray<{ text: string }> };
export type ChefLocalMcp = {
  getRecipeContext(): Promise<ChefRecipeExcerpt | null>;
  searchNotebook(query: string): Promise<{ titles: string[] }>;
  preparePreview(): Promise<{ prepared: true } | null>;
};

/** Réduction défensive avant retour au raisonneur: ni id Dexie, ni image, ni source. */
export function toChefRecipeExcerpt(recipe: ChefRecipeSource): ChefRecipeExcerpt {
  return {
    title: recipe.title.slice(0, 180),
    ingredients: recipe.ingredients.slice(0, 16).map(({ label }) => label.slice(0, 180)),
    steps: recipe.steps.slice(0, 8).map(({ text }) => text.slice(0, 500))
  };
}
