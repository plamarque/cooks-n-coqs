import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@cookies-et-coquilettes/domain";
import {
  assistantPreviewIngredientQuantityText,
  recipeFromAssistantPreview,
  saveAssistantPreview
} from "../src/services/preview-save-service";
import type { AssistantPreview } from "../src/utils/assistant-session";

function preview(overrides: Partial<AssistantPreview> = {}): AssistantPreview {
  return {
    requestId: 1,
    source: { type: "SCREENSHOT", capturedAt: "2026-10-03T10:00:00.000Z" },
    sourceFiles: [new File(["source"], "source.png", { type: "image/png" })],
    draft: {
      title: "Tarte",
      category: "SUCRE",
      ingredients: [{ id: "i", label: "Pommes", isScalable: false }],
      steps: [{ id: "s", order: 1, text: "Cuire." }]
    },
    ...overrides
  };
}

function fakeDependencies(options: { failImage?: boolean; failRecipe?: boolean; illustration?: Blob | undefined } = {}) {
  const imageRows: Array<{ id: string }> = [];
  const recipes: Recipe[] = [];
  let id = 0;
  return {
    imageRows,
    recipes,
    dependencies: {
      makeId: () => `id-${++id}`,
      now: () => "2026-10-03T10:00:00.000Z",
      prepareIllustration: async () => options.illustration ? { blob: options.illustration } : { blob: undefined as undefined },
      images: {
        async bulkAdd(rows: Array<{ id: string }>) {
          if (options.failImage) throw new Error("image write failed");
          imageRows.push(...rows);
        },
        async add(row: { id: string }) {
          if (options.failImage) throw new Error("image write failed");
          imageRows.push(row);
        }
      },
      recipes: {},
      createRecipe: {
        async createRecipe(recipe: Recipe) {
          if (options.failRecipe) throw new Error("recipe write failed");
          recipes.push(recipe);
        }
      },
      async transaction(_mode: string, _images: unknown, _recipes: unknown, operation: () => Promise<void>) {
        const imageSnapshot = [...imageRows];
        const recipeSnapshot = [...recipes];
        try {
          await operation();
        } catch (error) {
          imageRows.splice(0, imageRows.length, ...imageSnapshot);
          recipes.splice(0, recipes.length, ...recipeSnapshot);
          throw error;
        }
      }
    }
  };
}

test("preview Assistant : blobs source, illustration et recette sont committés ensemble", async () => {
  const fake = fakeDependencies({ illustration: new Blob(["illustration"], { type: "image/png" }) });
  const result = await saveAssistantPreview(preview(), "https://example.test/image.png", fake.dependencies as never);
  assert.equal(fake.imageRows.length, 2);
  assert.equal(fake.recipes.length, 1);
  assert.deepEqual(fake.recipes[0].sourceImageIds, [fake.imageRows[0].id]);
  assert.equal(fake.recipes[0].imageId, fake.imageRows[1].id);
  assert.equal(result.illustrationUnavailable, false);
});

test("preview Assistant : erreur image annule toute la transaction", async () => {
  const fake = fakeDependencies({ failImage: true });
  await assert.rejects(() => saveAssistantPreview(preview(), undefined, fake.dependencies as never), /image write failed/);
  assert.deepEqual(fake.imageRows, []);
  assert.deepEqual(fake.recipes, []);
});

test("preview Assistant : erreur recette annule les blobs déjà préparés", async () => {
  const fake = fakeDependencies({ failRecipe: true });
  await assert.rejects(() => saveAssistantPreview(preview(), undefined, fake.dependencies as never), /recipe write failed/);
  assert.deepEqual(fake.imageRows, []);
  assert.deepEqual(fake.recipes, []);
});

test("preview Assistant : illustration distante indisponible ne bloque pas la recette", async () => {
  const fake = fakeDependencies();
  const result = await saveAssistantPreview(preview({ sourceFiles: [] }), "https://example.test/image.png", fake.dependencies as never);
  assert.equal(fake.recipes.length, 1);
  assert.equal(fake.recipes[0].imageId, undefined);
  assert.equal(result.illustrationUnavailable, true);
});

test("preview Assistant : les médias d’étape préparés entrent dans la même transaction", async () => {
  const fake = fakeDependencies({ illustration: new Blob(["image"], { type: "image/png" }) });
  const result = await saveAssistantPreview(preview({
    sourceFiles: [],
    draft: {
      title: "Tarte",
      category: "SUCRE",
      ingredients: [{ id: "i", label: "Pommes", isScalable: false }],
      steps: [{
        id: "s",
        order: 1,
        text: "Cuire.",
        media: [
          { type: "image", imageUrl: "https://example.test/step.png" },
          { type: "video", url: "https://example.test/video" }
        ]
      }]
    }
  }), undefined, fake.dependencies as never);
  assert.equal(fake.imageRows.length, 1);
  assert.deepEqual(result.recipe.steps[0].media, [
    { type: "image", imageId: fake.imageRows[0].id },
    { type: "video", url: "https://example.test/video" }
  ]);
});

test("preview Assistant : une image d’étape indisponible est omise sans bloquer", async () => {
  const fake = fakeDependencies();
  const result = await saveAssistantPreview(preview({
    sourceFiles: [],
    draft: {
      title: "Tarte",
      category: "SUCRE",
      ingredients: [{ id: "i", label: "Pommes", isScalable: false }],
      steps: [{ id: "s", order: 1, text: "Cuire.", media: [{ type: "image", imageUrl: "https://example.test/step.png" }] }]
    }
  }), undefined, fake.dependencies as never);
  assert.equal(fake.recipes.length, 1);
  assert.equal(result.recipe.steps[0].media, undefined);
});

test("preview Assistant : draft invalide ne modifie aucune table", async () => {
  const fake = fakeDependencies();
  const invalid = preview({ draft: { title: "Vide", category: "SALE", ingredients: [], steps: [] } });
  await assert.rejects(() => saveAssistantPreview(invalid, undefined, fake.dependencies as never), /recipe needs/);
  assert.deepEqual(fake.imageRows, []);
  assert.deepEqual(fake.recipes, []);
});

test("projection preview : les règles domaine normalisent les quantités scalables", () => {
  const recipe = recipeFromAssistantPreview(preview({
    draft: {
      title: "Tarte",
      category: "SUCRE",
      ingredients: [{ id: "i", label: "Pommes", quantity: 2, isScalable: true }],
      steps: []
    }
  }), () => "id", () => "2026-10-03T10:00:00.000Z");
  assert.equal(recipe.ingredients[0].quantityBase, 2);
});

test("preview Assistant : les quantités structurées alimentent l'éditeur et la sauvegarde", () => {
  const ingredient = { id: "i", label: "Lardons", quantity: 200, unit: "g", isScalable: true };
  assert.equal(assistantPreviewIngredientQuantityText(ingredient), "200 g");
  assert.equal(assistantPreviewIngredientQuantityText({ ...ingredient, rawText: "une barquette" }), "une barquette");
  assert.equal(assistantPreviewIngredientQuantityText({ ...ingredient, quantity: undefined, unit: undefined }), "");

  const recipe = recipeFromAssistantPreview(preview({
    draft: {
      title: "Tartiflette",
      category: "SALE",
      ingredients: [ingredient],
      steps: []
    }
  }), () => "id", () => "2026-10-03T10:00:00.000Z");
  assert.equal(recipe.ingredients[0].rawText, "200 g");
});
