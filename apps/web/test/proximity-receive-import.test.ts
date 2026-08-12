import assert from "node:assert/strict";
import test from "node:test";
import {
  computeImportSourceStableKey,
  type ParsedRecipeDraft,
  type Recipe
} from "@cookies-et-coquilettes/domain";
import {
  buildRecipeFromProximityDraft,
  clearProximityModeBRetainedPayload,
  importProximityModeAAfterConfirm,
  importProximityModeBAfterConfirm,
  PARSE_FAIL_MESSAGE,
  resolveProximityPostConfirmAction
} from "../src/services/proximity-receive-import";
import {
  cancelProximityReceiveSession,
  createIdleProximityReceiveSession,
  openProximityReceiveSession
} from "../src/services/proximity-receive-session";

const SOURCE_URL = "https://example.com/recipes/tiramisu";

function sampleDraft(overrides: Partial<ParsedRecipeDraft> = {}): ParsedRecipeDraft {
  return {
    title: "Tiramisu",
    category: "SUCRE",
    servingsBase: 4,
    ingredients: [
      {
        id: "ing-1",
        order: 1,
        label: "Mascarpone",
        quantity: 250,
        unit: "g",
        isScalable: true,
        rawText: "Mascarpone"
      }
    ],
    steps: [{ id: "step-1", order: 1, text: "Mélanger." }],
    source: {
      type: "URL",
      url: SOURCE_URL,
      capturedAt: "2026-08-12T00:00:00.000Z"
    },
    imageUrl: "https://example.com/tiramisu.jpg",
    ...overrides
  };
}

/**
 * Miroir du garde App : Annuler / Mode A / Mode B → seams correspondants.
 * Compteurs = spy sur import Mode A / Mode B.
 */
async function runPostConfirmLikeApp(options: {
  userAction: "confirm" | "cancel";
  intent: Parameters<typeof resolveProximityPostConfirmAction>[0];
  importModeA: () => Promise<void>;
  importModeB?: () => Promise<void>;
}): Promise<{ importModeACalls: number; importModeBCalls: number }> {
  let importModeACalls = 0;
  let importModeBCalls = 0;
  if (options.userAction === "cancel") {
    return { importModeACalls, importModeBCalls };
  }
  const action = resolveProximityPostConfirmAction(options.intent);
  if (action === "mode-a") {
    importModeACalls += 1;
    await options.importModeA();
  } else if (action === "mode-b") {
    importModeBCalls += 1;
    await options.importModeB?.();
  }
  return { importModeACalls, importModeBCalls };
}

test("importProximityModeAAfterConfirm — crée avec importSourceStableKey", async () => {
  const draft = sampleDraft();
  const expectedKey = await computeImportSourceStableKey(draft.source);
  assert.ok(expectedKey);

  const created: Recipe[] = [];
  const result = await importProximityModeAAfterConfirm(SOURCE_URL, {
    importFromUrl: async () => draft,
    listRecipes: async () => [],
    createRecipe: async (recipe) => {
      created.push(recipe);
    },
    newId: () => "recipe-proximity-1",
    now: () => "2026-08-12T12:00:00.000Z"
  });

  assert.equal(result.status, "created");
  if (result.status !== "created") return;
  assert.equal(created.length, 1);
  assert.equal(result.recipe.id, "recipe-proximity-1");
  assert.equal(result.recipe.importSourceStableKey, expectedKey);
  assert.equal(result.recipe.source?.url, SOURCE_URL);
  assert.equal(result.recipe.title, "Tiramisu");
  assert.equal(result.draft.imageUrl, "https://example.com/tiramisu.jpg");
});

test("importProximityModeAAfterConfirm — skip si clé déjà en carnet (pas de create)", async () => {
  const draft = sampleDraft();
  const key = await computeImportSourceStableKey(draft.source);
  assert.ok(key);

  let createCalls = 0;
  const result = await importProximityModeAAfterConfirm(SOURCE_URL, {
    importFromUrl: async () => draft,
    listRecipes: async () => [{ importSourceStableKey: key }],
    createRecipe: async () => {
      createCalls += 1;
    }
  });

  assert.deepEqual(result, { status: "skipped", importSourceStableKey: key });
  assert.equal(createCalls, 0);
});

test("resolveProximityPostConfirmAction — Mode A / Mode B / invalid", () => {
  assert.equal(
    resolveProximityPostConfirmAction({ mode: "a", sourceUrl: SOURCE_URL, title: "Tiramisu" }),
    "mode-a"
  );
  assert.equal(
    resolveProximityPostConfirmAction({ mode: "b", ticketId: "ticket-1", title: "Tarte" }),
    "mode-b"
  );
  assert.equal(resolveProximityPostConfirmAction(null), "invalid");
  assert.equal(resolveProximityPostConfirmAction(undefined), "invalid");
  assert.equal(
    resolveProximityPostConfirmAction({ ok: false, reason: "Paramètre m manquant ou vide." }),
    "invalid"
  );
});

test("Annuler — n’appelle ni importProximityModeAAfterConfirm ni create", async () => {
  let createCalls = 0;
  let importFromUrlCalls = 0;

  const session = openProximityReceiveSession({
    intent: { mode: "a", sourceUrl: SOURCE_URL, title: "Tiramisu" },
    isStandalone: true,
    isCapable: true
  });
  assert.equal(session.phase, "confirm");
  const cancelled = cancelProximityReceiveSession(session);
  assert.deepEqual(cancelled, createIdleProximityReceiveSession());

  const { importModeACalls } = await runPostConfirmLikeApp({
    userAction: "cancel",
    intent: { mode: "a", sourceUrl: SOURCE_URL },
    importModeA: async () => {
      await importProximityModeAAfterConfirm(SOURCE_URL, {
        importFromUrl: async () => {
          importFromUrlCalls += 1;
          return sampleDraft();
        },
        listRecipes: async () => [],
        createRecipe: async () => {
          createCalls += 1;
        }
      });
    }
  });

  assert.equal(importModeACalls, 0);
  assert.equal(importFromUrlCalls, 0);
  assert.equal(createCalls, 0);
});

test("Confirmer Mode B — miroir App : consume + create (seam story 6)", async () => {
  clearProximityModeBRetainedPayload();
  const intent = { mode: "b" as const, ticketId: "ticket-1", title: "Tarte" };
  assert.equal(resolveProximityPostConfirmAction(intent), "mode-b");

  let createCalls = 0;
  let consumeCalls = 0;
  const { importModeACalls, importModeBCalls } = await runPostConfirmLikeApp({
    userAction: "confirm",
    intent,
    importModeA: async () => {
      await importProximityModeAAfterConfirm(SOURCE_URL, {
        importFromUrl: async () => sampleDraft(),
        listRecipes: async () => [],
        createRecipe: async () => {
          createCalls += 1;
        }
      });
    },
    importModeB: async () => {
      await importProximityModeBAfterConfirm(intent.ticketId, {
        consumeDrop: async (id) => {
          consumeCalls += 1;
          assert.equal(id, "ticket-1");
          return {
            title: "Tarte",
            category: "SUCRE",
            ingredients: [{ id: "", order: 1, label: "Farine", isScalable: false, rawText: "Farine" }],
            steps: [{ id: "", order: 1, text: "Mélanger." }]
          };
        },
        listRecipes: async () => [],
        createRecipe: async () => {
          createCalls += 1;
        },
        newId: () => "bob-from-mirror"
      });
    }
  });

  assert.equal(importModeACalls, 0);
  assert.equal(importModeBCalls, 1);
  assert.equal(consumeCalls, 1);
  assert.equal(createCalls, 1);
});

test("importProximityModeAAfterConfirm — parse fail : pas de put", async () => {
  let createCalls = 0;
  await assert.rejects(
    () =>
      importProximityModeAAfterConfirm(SOURCE_URL, {
        importFromUrl: async () =>
          sampleDraft({
            ingredients: [],
            steps: []
          }),
        listRecipes: async () => [],
        createRecipe: async () => {
          createCalls += 1;
        }
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, PARSE_FAIL_MESSAGE);
      return true;
    }
  );
  assert.equal(createCalls, 0);
});

test("importProximityModeAAfterConfirm — URL vide / whitespace → PARSE_FAIL sans create", async () => {
  let createCalls = 0;
  let importFromUrlCalls = 0;
  for (const url of ["", "   ", "\t\n"]) {
    await assert.rejects(
      () =>
        importProximityModeAAfterConfirm(url, {
          importFromUrl: async () => {
            importFromUrlCalls += 1;
            return sampleDraft();
          },
          listRecipes: async () => [],
          createRecipe: async () => {
            createCalls += 1;
          }
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, PARSE_FAIL_MESSAGE);
        return true;
      }
    );
  }
  assert.equal(importFromUrlCalls, 0);
  assert.equal(createCalls, 0);
});

test("importProximityModeAAfterConfirm — importFromUrl qui throw : pas de put", async () => {
  let createCalls = 0;
  await assert.rejects(
    () =>
      importProximityModeAAfterConfirm(SOURCE_URL, {
        importFromUrl: async () => {
          throw new Error("BFF down");
        },
        listRecipes: async () => [],
        createRecipe: async () => {
          createCalls += 1;
        }
      }),
    /BFF down/
  );
  assert.equal(createCalls, 0);
});

test("buildRecipeFromProximityDraft — force la clé après gate", () => {
  const recipe = buildRecipeFromProximityDraft(sampleDraft(), {
    importSourceStableKey: "stable-key-abc",
    id: "r1",
    now: "2026-08-12T12:00:00.000Z"
  });
  assert.equal(recipe.importSourceStableKey, "stable-key-abc");
  assert.equal(recipe.ingredients.length, 1);
  assert.equal(recipe.steps.length, 1);
});

test("buildRecipeFromProximityDraft — servingsBase 0 conservé (nullish, pas falsy)", () => {
  const recipe = buildRecipeFromProximityDraft(sampleDraft({ servingsBase: 0 }), {
    id: "r-zero",
    now: "2026-08-12T12:00:00.000Z"
  });
  assert.equal(recipe.servingsBase, 0);
  assert.equal(recipe.servingsCurrent, 0);
});
