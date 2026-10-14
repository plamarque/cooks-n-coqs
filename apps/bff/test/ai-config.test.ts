import assert from "node:assert/strict";
import test from "node:test";
import { getChatModel, getImageFallbackModel, getImageGenerationPolicy, getImageModel, getImageQuality } from "../src/ai-config.js";

const AI_ENV_KEYS = [
  "AI_CHAT_MODEL",
  "AI_CHAT_MODEL_PARSE",
  "AI_CHAT_MODEL_STEP_TIMER",
  "AI_CHAT_MODEL_REORDER",
  "AI_CHAT_MODEL_EXTRACT",
  "AI_IMAGE_MODEL_RECIPE",
  "AI_IMAGE_MODEL_INGREDIENT",
  "AI_IMAGE_MODEL_COOKING_STEP",
  "AI_IMAGE_FALLBACK_MODEL_RECIPE",
  "AI_IMAGE_FALLBACK_MODEL_INGREDIENT",
  "AI_IMAGE_FALLBACK_MODEL_COOKING_STEP",
  "AI_IMAGE_QUALITY_RECIPE",
  "AI_IMAGE_QUALITY_INGREDIENT",
  "AI_IMAGE_QUALITY_COOKING_STEP"
] as const;

function withClearedAiEnv(fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of AI_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  try {
    fn();
  } finally {
    for (const key of AI_ENV_KEYS) {
      const value = saved[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("défauts chat/image sans override env (matrice CAP-5)", () => {
  withClearedAiEnv(() => {
    assert.equal(getChatModel("parse"), "gpt-5.6-terra");
    assert.equal(getChatModel("step_timer"), "gpt-5.6-luna");
    assert.equal(getChatModel("reorder"), "gpt-5.6-luna");
    assert.equal(getChatModel("extract"), "gpt-5.6-luna");
    assert.equal(getImageModel("recipe"), "gpt-image-1-mini");
    assert.equal(getImageModel("ingredient"), "gpt-image-1-mini");
    assert.equal(getImageModel("cooking_step"), "gpt-image-1-mini");
    assert.equal(getImageFallbackModel("recipe"), "gpt-image-2.5-flare");
    assert.equal(getImageFallbackModel("ingredient"), "gpt-image-2.5-flare");
    assert.equal(getImageFallbackModel("cooking_step"), "gpt-image-2.5-flare");
    assert.equal(getImageQuality("recipe"), "low");
    assert.equal(getImageQuality("ingredient"), "low");
    assert.equal(getImageQuality("cooking_step"), "low");
  });
});

test("les overrides primaire et repli sont indépendants et forment la politique cacheable", () => {
  withClearedAiEnv(() => {
    process.env.AI_IMAGE_MODEL_RECIPE = "legacy-primary";
    process.env.AI_IMAGE_FALLBACK_MODEL_RECIPE = "configured-fallback";
    process.env.AI_IMAGE_QUALITY_RECIPE = "medium";
    assert.deepEqual(getImageGenerationPolicy("recipe"), {
      primaryModel: "legacy-primary",
      fallbackModel: "configured-fallback",
      quality: "medium"
    });
  });
});

test("override use-case extract gagne sur le défaut", () => {
  withClearedAiEnv(() => {
    process.env.AI_CHAT_MODEL_EXTRACT = "foo";
    assert.equal(getChatModel("extract"), "foo");
  });
});

test("override use-case gagne sur AI_CHAT_MODEL global", () => {
  withClearedAiEnv(() => {
    process.env.AI_CHAT_MODEL = "global";
    process.env.AI_CHAT_MODEL_EXTRACT = "foo";
    process.env.AI_CHAT_MODEL_PARSE = "parse-override";
    assert.equal(getChatModel("extract"), "foo");
    assert.equal(getChatModel("parse"), "parse-override");
  });
});

test("fallback global AI_CHAT_MODEL pour use-cases sans override", () => {
  withClearedAiEnv(() => {
    process.env.AI_CHAT_MODEL = "gpt-5.6-luna";
    assert.equal(getChatModel("parse"), "gpt-5.6-luna");
    assert.equal(getChatModel("step_timer"), "gpt-5.6-luna");
    assert.equal(getChatModel("reorder"), "gpt-5.6-luna");
    assert.equal(getChatModel("extract"), "gpt-5.6-luna");
  });
});

test("getChatModel('extract') résout sans erreur de type/runtime", () => {
  withClearedAiEnv(() => {
    const model = getChatModel("extract");
    assert.equal(typeof model, "string");
    assert.ok(model.length > 0);
  });
});
