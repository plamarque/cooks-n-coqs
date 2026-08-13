import assert from "node:assert/strict";
import test from "node:test";
import { getChatModel, getImageModel, getImageQuality } from "../src/ai-config.js";

const AI_ENV_KEYS = [
  "AI_CHAT_MODEL",
  "AI_CHAT_MODEL_PARSE",
  "AI_CHAT_MODEL_STEP_TIMER",
  "AI_CHAT_MODEL_REORDER",
  "AI_CHAT_MODEL_EXTRACT",
  "AI_IMAGE_MODEL_RECIPE",
  "AI_IMAGE_MODEL_INGREDIENT",
  "AI_IMAGE_MODEL_COOKING_STEP",
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
    assert.equal(getImageModel("recipe"), "gpt-image-2");
    assert.equal(getImageModel("ingredient"), "gpt-image-1-mini");
    assert.equal(getImageModel("cooking_step"), "gpt-image-1-mini");
    assert.equal(getImageQuality("recipe"), "low");
    assert.equal(getImageQuality("ingredient"), "low");
    assert.equal(getImageQuality("cooking_step"), "low");
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
