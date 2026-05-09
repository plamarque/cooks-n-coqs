import { db } from "../storage/db";
import { dexieRecipeService, storeImageFromUrl } from "./recipe-service";
import { generateCookingStepImage, generateRecipeImage } from "./import-service";
import { resolveIngredientImageId } from "./ingredient-image-service";

const BFF_URL = import.meta.env.VITE_BFF_URL || "http://localhost:8787";

function bffBase(): string {
  return BFF_URL.replace(/\/+$/, "");
}

async function fetchJsonCacheKey(url: string, body: unknown): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { key?: string };
    return typeof data.key === "string" && data.key.trim() ? data.key.trim() : undefined;
  } catch {
    return undefined;
  }
}

async function tryStoreImageFromGeneratedKey(key: string): Promise<string | undefined> {
  const imgUrl = `${bffBase()}/api/generated-images/${encodeURIComponent(key)}`;
  return storeImageFromUrl(imgUrl);
}

/**
 * Reconstruit photo principale, icônes ingrédients et images d’étapes (cache BFF puis IA).
 * Ne lève pas d’erreur : best-effort après import d’archive légère.
 */
export async function rehydrateRecipeMediaAfterArchiveImport(recipeId: string): Promise<void> {
  let recipe = await db.recipes.get(recipeId);
  if (!recipe) return;

  try {
    if (!recipe.imageId) {
      const cacheKey = await fetchJsonCacheKey(`${bffBase()}/api/generated-images/cache-key/recipe-image`, {
        title: recipe.title,
        ingredients: recipe.ingredients.map((i) => ({ label: i.label })),
        steps: recipe.steps.map((s) => ({ text: s.text }))
      });
      let mainImageId: string | undefined;
      if (cacheKey) {
        mainImageId = await tryStoreImageFromGeneratedKey(cacheKey);
      }
      if (!mainImageId) {
        const url = await generateRecipeImage({
          title: recipe.title,
          ingredients: recipe.ingredients,
          steps: recipe.steps
        });
        if (url) {
          mainImageId = await storeImageFromUrl(url);
        }
      }
      if (mainImageId) {
        await dexieRecipeService.updateRecipe(recipeId, { imageId: mainImageId });
      }
    }
  } catch {
    /* ignore */
  }

  recipe = await db.recipes.get(recipeId);
  if (!recipe) return;

  try {
    const ingredients = [...recipe.ingredients];
    let changed = false;
    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i]!;
      if (ing.imageId) continue;
      const id = await resolveIngredientImageId({ label: ing.label, imageId: undefined });
      if (id) {
        ingredients[i] = { ...ing, imageId: id };
        changed = true;
      }
    }
    if (changed) {
      await dexieRecipeService.updateRecipe(recipeId, { ingredients });
    }
  } catch {
    /* ignore */
  }

  recipe = await db.recipes.get(recipeId);
  if (!recipe) return;

  try {
    const steps = [...recipe.steps];
    let stepsChanged = false;
    for (let si = 0; si < steps.length; si++) {
      const step = steps[si]!;
      const text = step.text?.trim();
      if (!text) continue;
      const hasStepImage = (step.media ?? []).some((m) => m.type === "image");
      if (hasStepImage) continue;

      const stepKey = await fetchJsonCacheKey(
        `${bffBase()}/api/generated-images/cache-key/cooking-step-image`,
        { stepText: text }
      );
      let stepImageId: string | undefined;
      if (stepKey) {
        stepImageId = await tryStoreImageFromGeneratedKey(stepKey);
      }
      if (!stepImageId) {
        const genUrl = await generateCookingStepImage(text);
        if (genUrl) {
          stepImageId = await storeImageFromUrl(genUrl);
        }
      }
      if (!stepImageId) continue;

      const prevMedia = step.media ?? [];
      const newMedia = [{ type: "image" as const, imageId: stepImageId }, ...prevMedia];
      steps[si] = { ...step, media: newMedia };
      stepsChanged = true;
    }
    if (stepsChanged) {
      await dexieRecipeService.updateRecipe(recipeId, { steps });
    }
  } catch {
    /* ignore */
  }
}
