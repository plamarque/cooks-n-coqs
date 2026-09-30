import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichMissingCategoryWithExtract,
  enrichMissingRecipeTimesWithExtract,
  enrichStepIngredientMentions,
  parseRecipeWithCloud,
  reorderStepsByRecipeLogic
} from "../src/parsing-client.js";
import { detectStepTimerDurationSeconds } from "../src/step-timer-detector.js";
import type { ParsedRecipeDraft } from "../src/types.js";

type CapturedPayload = Record<string, unknown>;
type CapturedRequest = {
  payload: CapturedPayload;
  url: string;
  method: string;
};

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "AI_CHAT_MODEL",
  "AI_CHAT_MODEL_PARSE",
  "AI_CHAT_MODEL_STEP_TIMER",
  "AI_CHAT_MODEL_REORDER",
  "AI_CHAT_MODEL_EXTRACT"
] as const;

function draft(): ParsedRecipeDraft {
  return {
    title: "Recette test",
    category: "SALE",
    ingredients: [{ id: "farine", label: "farine", isScalable: true }],
    steps: [
      { id: "step-1", order: 1, text: "Mélanger la farine." },
      { id: "step-2", order: 2, text: "Puis cuire." }
    ]
  };
}

function responseFor(prompt: string): string {
  if (prompt.includes("proposer un timer")) return '{"durationSeconds":600}';
  if (prompt.includes("extraire les temps")) {
    return '{"prepTimeMin":10,"cookTimeMin":20,"restTimeMin":null}';
  }
  if (prompt.includes("classer une recette")) return '{"category":"SALE"}';
  if (prompt.includes("lier chaque étape")) return '{"mentions":[]}';
  if (prompt.includes("Réordonne-les")) return '[{"text":"Mélanger"},{"text":"Cuire"}]';
  return JSON.stringify({
    title: "Recette test",
    category: "SALE",
    ingredients: [{ label: "farine", isScalable: true }],
    steps: [{ text: "Mélanger." }]
  });
}

function chatResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 0,
      model: "mock-model",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

test("tous les appels Chat omettent temperature, y compris avec overrides", async () => {
  const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const requests: CapturedRequest[] = [];
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AI_CHAT_MODEL_PARSE = "parse-override";
  process.env.AI_CHAT_MODEL_STEP_TIMER = "timer-override";
  process.env.AI_CHAT_MODEL_REORDER = "reorder-override";
  process.env.AI_CHAT_MODEL_EXTRACT = "extract-override";
  globalThis.fetch = (async (input, init) => {
    const payload = JSON.parse(String(init?.body)) as CapturedPayload;
    requests.push({
      payload,
      url: String(input),
      method: init?.method ?? "GET"
    });
    const messages = payload.messages as Array<{ content?: string }>;
    return chatResponse(responseFor(messages[0]?.content ?? ""));
  }) as typeof fetch;

  try {
    await parseRecipeWithCloud({ sourceType: "TEXT", text: "Une recette assez longue pour le test." });
    await parseRecipeWithCloud({
      sourceType: "SCREENSHOT",
      screenshotBase64: "ZmFrZQ==",
      screenshotMimeType: "image/png"
    });
    await enrichMissingRecipeTimesWithExtract(
      draft(),
      "<html><body>Une recette sans durée explicite suffisamment longue.</body></html>"
    );
    await enrichMissingCategoryWithExtract(
      draft(),
      "<html><head><meta name=\"keywords\" content=\"dessert, plat principal\" /></head></html>"
    );
    await enrichStepIngredientMentions({
      ...draft(),
      steps: [{ id: "step-1", order: 1, text: "Ajoutez-les ensuite." }]
    });
    await reorderStepsByRecipeLogic([
      { id: "step-1", order: 1, text: "Cuire" },
      { id: "step-2", order: 2, text: "Mélanger" }
    ]);
    await detectStepTimerDurationSeconds("Laisser cuire une dizaine de minutes.");

    // L'import texte déclenche aussi l'enrichissement de mentions : huit requêtes
    // pour les sept parcours, tout en ne couvrant que les sept callsites Chat.
    assert.equal(requests.length, 8, "tous les parcours Chat attendus doivent être interceptés");
    assert.ok(requests.every((request) => request.method === "POST"));
    assert.ok(requests.every((request) => request.url.endsWith("/chat/completions")));
    assert.ok(requests.every(({ payload }) => !("temperature" in payload)));
    assert.deepEqual(
      requests.map(({ payload }) => payload.model),
      [
        "parse-override",
        "extract-override",
        "parse-override",
        "extract-override",
        "extract-override",
        "extract-override",
        "reorder-override",
        "timer-override"
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
