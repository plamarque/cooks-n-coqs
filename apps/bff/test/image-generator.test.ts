import assert from "node:assert/strict";
import test from "node:test";
import { generateCookingStepImage, generateIngredientImage, generateRecipeImage, imageGenerationDependencies } from "../src/image-generator.js";

const imageEnvKeys = [
  "OPENAI_API_KEY",
  "AI_IMAGE_MODEL_RECIPE", "AI_IMAGE_FALLBACK_MODEL_RECIPE",
  "AI_IMAGE_MODEL_INGREDIENT", "AI_IMAGE_FALLBACK_MODEL_INGREDIENT",
  "AI_IMAGE_MODEL_COOKING_STEP", "AI_IMAGE_FALLBACK_MODEL_COOKING_STEP"
] as const;

async function withImageEnv(fn: () => Promise<void>): Promise<void> {
  const saved = Object.fromEntries(imageEnvKeys.map((key) => [key, process.env[key]]));
  const savedClient = imageGenerationDependencies.createClient;
  try {
    process.env.OPENAI_API_KEY = "test-key";
    for (const key of imageEnvKeys.slice(1)) delete process.env[key];
    await fn();
  } finally {
    imageGenerationDependencies.createClient = savedClient;
    for (const key of imageEnvKeys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("Mini réussit sans appeler Flare", async () => withImageEnv(async () => {
  const calls: Array<Record<string, unknown>> = [];
  imageGenerationDependencies.createClient = () => ({ images: { generate: async (options) => {
    calls.push(options);
    return { data: [{ b64_json: "mini" }] };
  } } });
  assert.equal(await generateIngredientImage({ label: "basilic" }), "data:image/png;base64,mini");
  assert.deepEqual(calls.map((call) => call.model), ["gpt-image-1-mini"]);
}));

test("une sortie Mini vide déclenche exactement un repli Flare avec les mêmes paramètres", async () => withImageEnv(async () => {
  const calls: Array<Record<string, unknown>> = [];
  imageGenerationDependencies.createClient = () => ({ images: { generate: async (options) => {
    calls.push(options);
    return calls.length === 1 ? { data: [] } : { data: [{ b64_json: "flare" }] };
  } } });
  assert.equal(await generateIngredientImage({ label: "basilic" }), "data:image/png;base64,flare");
  assert.deepEqual(calls.map((call) => call.model), ["gpt-image-1-mini", "gpt-image-2.5-flare"]);
  assert.equal(calls[0].prompt, calls[1].prompt);
  assert.equal(calls[0].size, calls[1].size);
  assert.equal(calls[0].quality, calls[1].quality);
}));

test("un b64 Mini vide est traité comme une sortie vide et déclenche Flare", async () => withImageEnv(async () => {
  const calls: Array<Record<string, unknown>> = [];
  imageGenerationDependencies.createClient = () => ({ images: { generate: async (options) => {
    calls.push(options);
    return calls.length === 1 ? { data: [{ b64_json: "  " }] } : { data: [{ b64_json: "flare" }] };
  } } });
  assert.equal(await generateIngredientImage({ label: "basilic" }), "data:image/png;base64,flare");
  assert.deepEqual(calls.map((call) => call.model), ["gpt-image-1-mini", "gpt-image-2.5-flare"]);
}));

test("une URL Mini blanche est traitée comme une sortie vide et déclenche Flare", async () => withImageEnv(async () => {
  const calls: Array<Record<string, unknown>> = [];
  imageGenerationDependencies.createClient = () => ({ images: { generate: async (options) => {
    calls.push(options);
    return calls.length === 1 ? { data: [{ url: "  " }] } : { data: [{ b64_json: "flare" }] };
  } } });
  assert.equal(await generateIngredientImage({ label: "basilic" }), "data:image/png;base64,flare");
  assert.deepEqual(calls.map((call) => call.model), ["gpt-image-1-mini", "gpt-image-2.5-flare"]);
}));

test("recipe et cooking_step utilisent Mini sans appeler Flare", async () => withImageEnv(async () => {
  const calls: Array<Record<string, unknown>> = [];
  imageGenerationDependencies.createClient = () => ({ images: { generate: async (options) => {
    calls.push(options);
    return { data: [{ b64_json: "mini" }] };
  } } });
  assert.equal(await generateRecipeImage({ title: "Tarte", ingredients: [], steps: [] }), "data:image/png;base64,mini");
  assert.equal(await generateCookingStepImage({ stepText: "Mélanger" }), "data:image/png;base64,mini");
  assert.deepEqual(calls.map((call) => call.model), ["gpt-image-1-mini", "gpt-image-1-mini"]);
}));

test("un repli identique au primaire n'est pas réessayé", async () => withImageEnv(async () => {
  const calls: Array<Record<string, unknown>> = [];
  const warnings: unknown[][] = [];
  const savedWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  process.env.AI_IMAGE_FALLBACK_MODEL_INGREDIENT = "gpt-image-1-mini";
  imageGenerationDependencies.createClient = () => ({ images: { generate: async (options) => {
    calls.push(options);
    throw new Error("provider unavailable");
  } } });
  try {
    assert.equal(await generateIngredientImage({ label: "basilic" }), undefined);
    assert.deepEqual(calls.map((call) => call.model), ["gpt-image-1-mini"]);
    assert.deepEqual(warnings.at(-1), ["Image generation failed after fallback", { useCase: "ingredient", primaryModel: "gpt-image-1-mini", fallbackModel: "gpt-image-1-mini", fallbackCause: "same_as_primary" }]);
  } finally {
    console.warn = savedWarn;
  }
}));

test("deux échecs fournisseur restent un soft-fail sans troisième tentative", async () => withImageEnv(async () => {
  const calls: Array<Record<string, unknown>> = [];
  const warnings: unknown[][] = [];
  const savedWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  imageGenerationDependencies.createClient = () => ({ images: { generate: async (options) => {
    calls.push(options);
    throw new Error("provider unavailable");
  } } });
  try {
    assert.equal(await generateIngredientImage({ label: "basilic" }), undefined);
    assert.deepEqual(calls.map((call) => call.model), ["gpt-image-1-mini", "gpt-image-2.5-flare"]);
    assert.deepEqual(warnings, [
      ["Image generation fallback", { useCase: "ingredient", primaryModel: "gpt-image-1-mini", fallbackModel: "gpt-image-2.5-flare", primaryCause: "provider_error" }],
      ["Image generation failed after fallback", { useCase: "ingredient", primaryModel: "gpt-image-1-mini", fallbackModel: "gpt-image-2.5-flare", fallbackCause: "provider_error" }]
    ]);
  } finally {
    console.warn = savedWarn;
  }
}));
