import type { NotebookCandidateWireV1, Recipe } from "@cookies-et-coquilettes/domain";
import { dexieRecipeService } from "../services/recipe-service";

export type NotebookSnapshot = {
  candidates: NotebookCandidateWireV1[];
  resolve(candidateRef: string): Recipe | undefined;
};

function cloneAndFreeze<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (nested: unknown): void => {
    if (!nested || typeof nested !== "object" || Object.isFrozen(nested)) return;
    for (const child of Object.values(nested)) freeze(child);
    Object.freeze(nested);
  };
  freeze(clone);
  return clone;
}

/** Snapshot strictement local et éphémère : les ids IndexedDB ne quittent jamais le navigateur. */
export async function buildNotebookSnapshot(listRecipes: () => Promise<Recipe[]> = () => dexieRecipeService.listRecipes()): Promise<NotebookSnapshot> {
  const recipes = [...await listRecipes()]
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
    .slice(0, 60);
  const refs = new Map<string, Recipe>();
  const candidates = recipes.map((recipe, index) => {
    const candidateRef = `candidate-${index + 1}`;
    refs.set(candidateRef, cloneAndFreeze(recipe));
    const durationMin = [recipe.prepTimeMin, recipe.cookTimeMin, recipe.restTimeMin].reduce<number>((sum, value) => sum + (value ?? 0), 0) || undefined;
    return Object.freeze({
      candidateRef,
      title: recipe.title.slice(0, 180),
      ingredientLabels: Object.freeze(recipe.ingredients.map(({ label }) => label.slice(0, 120)).filter(Boolean).slice(0, 40)),
      durationMin
    });
  });
  return Object.freeze({ candidates: Object.freeze(candidates) as unknown as NotebookCandidateWireV1[], resolve: (candidateRef: string) => refs.get(candidateRef) });
}

/** Contrôles déterministes : une sélection distante ne peut pas contourner une contrainte formulée littéralement. */
export function candidateMeetsLiteralConstraints(request: string, recipe: Recipe): boolean {
  const normalized = request.toLocaleLowerCase("fr-FR");
  const labels = recipe.ingredients.map(({ label }) => label.toLocaleLowerCase("fr-FR"));
  const forbidden = [...normalized.matchAll(/\bsans\s+([\p{L}-]+)/gu)].map((match) => match[1]);
  const required = [...normalized.matchAll(/\bavec\s+([\p{L}-]+)/gu)].map((match) => match[1]);
  if (forbidden.some((ingredient) => labels.some((label) => label.includes(ingredient)))) return false;
  if (required.some((ingredient) => !labels.some((label) => label.includes(ingredient)))) return false;
  const requestedDuration = normalized.match(/\b(?:en|moins de)\s+(\d{1,3})\s*min/);
  if (requestedDuration) {
    const duration = [recipe.prepTimeMin, recipe.cookTimeMin, recipe.restTimeMin].reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const limit = Number(requestedDuration[1]);
    if (!duration || (normalized.includes("moins de") ? duration >= limit : duration > limit)) return false;
  }
  return true;
}
