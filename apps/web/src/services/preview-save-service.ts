import {
  assertRecipeValidForSave,
  normalizeRecipeForSave,
  type ParsedRecipeDraft,
  type Recipe,
  type RecipeService
} from "@cookies-et-coquilettes/domain";
import { db } from "../storage/db";
import type { AssistantPreview } from "../utils/assistant-session";
import {
  createRecipeImageRow,
  dexieRecipeService,
  prepareImageFromUrl
} from "./recipe-service";
import { preparePreviewStepMediaForSave } from "./step-media-import";

export type PreviewSaveResult = {
  recipe: Recipe;
  illustrationUnavailable: boolean;
};

type PreviewSaveDependencies = {
  prepareIllustration: typeof prepareImageFromUrl;
  createRecipe: Pick<RecipeService, "createRecipe">;
  transaction: typeof db.transaction;
  images: typeof db.images;
  recipes: typeof db.recipes;
  makeId: () => string;
  now: () => string;
};

const defaultDependencies: PreviewSaveDependencies = {
  prepareIllustration: prepareImageFromUrl,
  createRecipe: dexieRecipeService,
  transaction: db.transaction.bind(db),
  images: db.images,
  recipes: db.recipes,
  makeId: () => crypto.randomUUID(),
  now: () => new Date().toISOString()
};

/** Projette la preview volatile vers le modèle recette, sans écrire de donnée. */
export function recipeFromAssistantPreview(
  preview: AssistantPreview,
  makeId: () => string = () => crypto.randomUUID(),
  now = () => new Date().toISOString()
): Recipe {
  const draft: ParsedRecipeDraft = preview.draft;
  const ingredients = draft.ingredients
    .filter((ingredient) => ingredient.label.trim())
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((ingredient, index) => ({
      ...ingredient,
      id: ingredient.id || makeId(),
      order: index + 1,
      label: ingredient.label.trim(),
      rawText: ingredient.rawText ?? ingredient.label.trim()
    }));
  const ingredientIds = new Set(ingredients.map((ingredient) => ingredient.id));
  const steps = draft.steps
    .filter((step) => step.text.trim())
    .sort((a, b) => a.order - b.order)
    .map((step, index) => ({
      id: step.id || makeId(),
      order: index + 1,
      text: step.text.trim(),
      ...(step.media?.filter((medium) => medium.type === "video").length
        ? { media: step.media.filter((medium) => medium.type === "video") }
        : {}),
      ...(step.ingredientIds?.filter((id) => ingredientIds.has(id)).length
        ? { ingredientIds: step.ingredientIds.filter((id) => ingredientIds.has(id)) }
        : {})
    }));
  const timestamp = now();
  const previewSource = preview.source ?? draft.source;
  // `preview` arrive depuis un ref Vue : ne jamais remettre son Proxy dans Dexie.
  const source = previewSource
    ? {
        type: previewSource.type,
        ...(previewSource.url ? { url: previewSource.url } : {}),
        capturedAt: previewSource.capturedAt
      }
    : undefined;
  const recipe: Recipe = {
    id: makeId(),
    title: draft.title.trim(),
    category: draft.category,
    favorite: false,
    ...(draft.servingsBase ? { servingsBase: draft.servingsBase, servingsCurrent: draft.servingsBase } : {}),
    ingredients,
    steps,
    ...(draft.prepTimeMin ? { prepTimeMin: draft.prepTimeMin } : {}),
    ...(draft.cookTimeMin ? { cookTimeMin: draft.cookTimeMin } : {}),
    ...(draft.restTimeMin ? { restTimeMin: draft.restTimeMin } : {}),
    ...(source ? { source } : {}),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  return normalizeRecipeForSave(recipe);
}

/**
 * Seul chemin Assistant preview -> recette locale : préparation réseau best-effort,
 * puis une unique transaction pour les blobs source, l'illustration et la recette.
 */
export async function saveAssistantPreview(
  preview: AssistantPreview,
  illustrationUrl: string | null | undefined,
  dependencies: Partial<PreviewSaveDependencies> = {}
): Promise<PreviewSaveResult> {
  const deps = { ...defaultDependencies, ...dependencies };
  const recipe = recipeFromAssistantPreview(preview, deps.makeId, deps.now);
  assertRecipeValidForSave(recipe);

  let preparedIllustration: Awaited<ReturnType<typeof prepareImageFromUrl>> = { blob: undefined, issue: "fetch" };
  if (illustrationUrl) {
    try {
      preparedIllustration = await deps.prepareIllustration(illustrationUrl);
    } catch {
      // Une illustration distante est facultative ; ne pas bloquer une recette valide.
    }
  }
  const preparedStepMedia = await preparePreviewStepMediaForSave(recipe.steps, preview.draft.steps, {
    prepareImage: deps.prepareIllustration,
    createImageRow: (blob) => createRecipeImageRow(blob, deps.makeId())
  });
  const sourceRows = preview.sourceFiles
    .filter((file) => file.type.startsWith("image/"))
    .map((file) => createRecipeImageRow(file, deps.makeId()));
  const illustrationRow = preparedIllustration.blob
    ? createRecipeImageRow(preparedIllustration.blob, deps.makeId())
    : undefined;
  const savedRecipe: Recipe = {
    ...recipe,
    steps: preparedStepMedia.steps,
    ...(sourceRows.length ? { sourceImageIds: sourceRows.map((row) => row.id) } : {}),
    ...(illustrationRow ? { imageId: illustrationRow.id } : {})
  };

  await deps.transaction("rw", deps.images, deps.recipes, async () => {
    const imageRows = [...sourceRows, ...preparedStepMedia.imageRows, ...(illustrationRow ? [illustrationRow] : [])];
    if (imageRows.length) await deps.images.bulkAdd(imageRows);
    await deps.createRecipe.createRecipe(savedRecipe);
  });

  return { recipe: savedRecipe, illustrationUnavailable: Boolean(illustrationUrl && !illustrationRow) };
}
