import assert from "node:assert/strict";
import test from "node:test";
import { buildCookingStepImageCacheKey, buildIngredientImageCacheKey, buildRecipeImageCacheKey } from "../src/image-cache.js";
import { getImageGenerationPolicy } from "../src/ai-config.js";

test("buildRecipeImageCacheKey is stable for recipe-image cache-key API payload", () => {
  const input = {
    title: "Tarte aux fraises",
    ingredients: [{ label: "Fraise" }, { label: "Sucre" }],
    steps: [{ text: "Mélanger" }, { text: "Cuire" }]
  };
  const opts = getImageGenerationPolicy("recipe");
  const a = buildRecipeImageCacheKey(input, opts);
  const b = buildRecipeImageCacheKey(input, opts);
  assert.equal(a, b);
  assert.match(a, /^recipe-[a-f0-9]{64}$/);
});

test("buildCookingStepImageCacheKey is stable for cooking-step cache-key API payload", () => {
  const input = { stepText: "Mélanger délicatement" };
  const opts = getImageGenerationPolicy("cooking_step");
  const a = buildCookingStepImageCacheKey(input, opts);
  const b = buildCookingStepImageCacheKey(input, opts);
  assert.equal(a, b);
  assert.match(a, /^cooking-step-[a-f0-9]{64}$/);
});

test("les trois clés isolent primaire, repli et qualité sans modifier les médias historiques", () => {
  const first = { primaryModel: "gpt-image-1-mini", fallbackModel: "gpt-image-2.5-flare", quality: "low" };
  const changedFallback = { ...first, fallbackModel: "another-fallback" };
  const entries = [
    [buildRecipeImageCacheKey, { title: "Tarte", ingredients: [], steps: [] }],
    [buildIngredientImageCacheKey, { label: "Basilic" }],
    [buildCookingStepImageCacheKey, { stepText: "Mélanger" }]
  ] as const;
  for (const [buildKey, input] of entries) {
    assert.notEqual(buildKey(input, first), buildKey(input, changedFallback));
  }
});
