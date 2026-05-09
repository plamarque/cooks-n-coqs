import assert from "node:assert/strict";
import test from "node:test";
import { buildCookingStepImageCacheKey, buildRecipeImageCacheKey } from "../src/image-cache.js";
import { getImageModel, getImageQuality } from "../src/ai-config.js";

test("buildRecipeImageCacheKey is stable for recipe-image cache-key API payload", () => {
  const input = {
    title: "Tarte aux fraises",
    ingredients: [{ label: "Fraise" }, { label: "Sucre" }],
    steps: [{ text: "Mélanger" }, { text: "Cuire" }]
  };
  const opts = { model: getImageModel("recipe"), quality: getImageQuality("recipe") };
  const a = buildRecipeImageCacheKey(input, opts);
  const b = buildRecipeImageCacheKey(input, opts);
  assert.equal(a, b);
  assert.match(a, /^recipe-[a-f0-9]{64}$/);
});

test("buildCookingStepImageCacheKey is stable for cooking-step cache-key API payload", () => {
  const input = { stepText: "Mélanger délicatement" };
  const opts = { model: getImageModel("cooking_step"), quality: getImageQuality("cooking_step") };
  const a = buildCookingStepImageCacheKey(input, opts);
  const b = buildCookingStepImageCacheKey(input, opts);
  assert.equal(a, b);
  assert.match(a, /^cooking-step-[a-f0-9]{64}$/);
});
