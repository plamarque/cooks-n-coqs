import assert from "node:assert/strict";
import test from "node:test";
import {
  computeImportSourceStableKey,
  type ParsedRecipeDraft,
  type Recipe
} from "@cookies-et-coquilettes/domain";
import {
  PROXIMITY_DROP_CREATE_FAIL_MESSAGE,
  PROXIMITY_DROP_UNAVAILABLE_MESSAGE,
  ProximityDropClientError,
  consumeProximityDrop,
  createProximityDrop
} from "../src/services/proximity-drop-client";
import {
  proximityDropEnvelopeToPostBody,
  recipeToProximityDropEnvelope
} from "../src/services/proximity-mode-b-envelope";
import {
  buildModeBDeepLink,
  isModeAShareableSourceUrl,
  parseProximityDeepLinkSearch
} from "../src/services/proximity-deep-link-core";
import {
  clearProximityModeBRetainedPayload,
  getProximityModeBRetainedPayload,
  importProximityModeBAfterConfirm,
  parseProximityModeBPayload,
  resolveProximityPostConfirmAction,
  retryProximityModeBCreateFromMemory
} from "../src/services/proximity-receive-import";
import { ProximityTransfer } from "../src/services/proximity-transfer-service";
import {
  cancelProximityReceiveSession,
  openProximityReceiveSession
} from "../src/services/proximity-receive-session";

const ORIGIN = "https://example.github.io";
const SOURCE_URL = "https://example.com/recipes/tiramisu";

function sampleLocalRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "alice-recipe-1",
    title: "Tarte maison",
    category: "SUCRE",
    favorite: false,
    servingsBase: 4,
    servingsCurrent: 8,
    ingredients: [
      {
        id: "alice-ing-1",
        order: 1,
        label: "Farine",
        quantity: 400,
        quantityBase: 200,
        unit: "g",
        isScalable: true,
        rawText: "Farine",
        imageId: "blob-alice"
      }
    ],
    steps: [
      {
        id: "alice-step-1",
        order: 1,
        text: "Mélanger.",
        media: [{ type: "image", imageId: "step-blob" }]
      }
    ],
    imageId: "hero-alice",
    sourceImageIds: ["src-1"],
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    ...overrides
  };
}

function sampleModeBDraft(overrides: Partial<ParsedRecipeDraft> = {}): ParsedRecipeDraft {
  return {
    title: "Tarte maison",
    category: "SUCRE",
    servingsBase: 4,
    ingredients: [
      {
        id: "",
        order: 1,
        label: "Farine",
        quantity: 200,
        unit: "g",
        isScalable: true,
        rawText: "Farine"
      }
    ],
    steps: [{ id: "", order: 1, text: "Mélanger." }],
    ...overrides
  };
}

function installMockWindowOrigin(origin: string): () => void {
  const previousWindow = globalThis.window;
  // @ts-expect-error — mock minimal pour tests Node
  globalThis.window = { location: { origin } };
  return () => {
    if (previousWindow === undefined) {
      // @ts-expect-error — restaure l’absence de window
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  };
}

function mockFetchSequence(
  handlers: Array<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response>
): () => void {
  const original = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async (input, init) => {
    const handler = handlers[call];
    call += 1;
    if (!handler) {
      throw new Error(`fetch inattendu #${call}`);
    }
    return handler(input, init);
  };
  return () => {
    globalThis.fetch = original;
  };
}

test("gate Mode B — complément de Mode A (pas d’URL http(s))", () => {
  assert.equal(isModeAShareableSourceUrl(undefined), false);
  assert.equal(isModeAShareableSourceUrl(null), false);
  assert.equal(isModeAShareableSourceUrl(""), false);
  assert.equal(isModeAShareableSourceUrl("ftp://x"), false);
  assert.equal(isModeAShareableSourceUrl(SOURCE_URL), true);
});

test("envelope Mode B — sans ids Alice / blobs ; quantityBase aux servings de capture", () => {
  const envelope = recipeToProximityDropEnvelope(sampleLocalRecipe());
  assert.equal(envelope.title, "Tarte maison");
  assert.equal(envelope.servingsBase, 4);
  assert.equal(envelope.ingredients[0]?.quantity, 200);
  assert.equal(envelope.ingredients[0]?.id, "");
  assert.equal(envelope.ingredients[0]?.imageId, undefined);
  assert.equal(envelope.steps[0]?.id, "");
  assert.equal(envelope.steps[0]?.media, undefined);
  assert.equal((envelope as { imageId?: string }).imageId, undefined);
  assert.equal((envelope as { sourceImageIds?: string[] }).sourceImageIds, undefined);

  const body = proximityDropEnvelopeToPostBody(envelope);
  assert.equal(body.title, "Tarte maison");
  assert.ok(Array.isArray(body.ingredients));
  const ing0 = (body.ingredients as Array<Record<string, unknown>>)[0];
  assert.equal(ing0.id, undefined);
  assert.equal(ing0.imageId, undefined);
  assert.equal(ing0.quantity, 200);
});

test("Alice Mode B — POST drop + lien m=b&t= (pas de JSON recette dans le QR)", async () => {
  const restoreFetch = mockFetchSequence([
    async (_input, init) => {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body)) as { title?: string };
      assert.equal(body.title, "Tarte maison");
      return new Response(JSON.stringify({ id: "ticket-abc", expiresAt: "2026-08-12T12:15:00.000Z" }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    }
  ]);
  const restoreWindow = installMockWindowOrigin(ORIGIN);

  try {
    const envelope = recipeToProximityDropEnvelope(sampleLocalRecipe());
    const created = await createProximityDrop(proximityDropEnvelopeToPostBody(envelope));
    assert.equal(created.id, "ticket-abc");

    const link = ProximityTransfer.buildModeBLink(created.id, "Tarte maison");
    const url = new URL(link);
    assert.equal(url.searchParams.get("m"), "b");
    assert.equal(url.searchParams.get("t"), "ticket-abc");
    assert.equal(url.searchParams.get("title"), "Tarte maison");
    assert.equal(link.includes("Farine"), false);
    assert.equal(link.includes("ingredients"), false);

    const parsed = parseProximityDeepLinkSearch(url.search);
    assert.deepEqual(parsed, { mode: "b", ticketId: "ticket-abc", title: "Tarte maison" });
  } finally {
    restoreFetch();
    restoreWindow();
  }
});

test("Alice Mode B — erreur POST : pas de lien trompeur", async () => {
  const restoreFetch = mockFetchSequence([
    async () => new Response(JSON.stringify({ error: "title is required" }), { status: 400 })
  ]);
  try {
    await assert.rejects(
      () => createProximityDrop({ title: "" }),
      (err: unknown) => {
        assert.ok(err instanceof ProximityDropClientError);
        assert.equal(err.message, PROXIMITY_DROP_CREATE_FAIL_MESSAGE);
        return true;
      }
    );
  } finally {
    restoreFetch();
  }
});

test("Bob Mode B — consume + create Bob-ids (sans clé)", async () => {
  clearProximityModeBRetainedPayload();
  let consumeCalls = 0;
  const created: Recipe[] = [];
  const draft = sampleModeBDraft();

  const result = await importProximityModeBAfterConfirm("ticket-1", {
    consumeDrop: async (id) => {
      consumeCalls += 1;
      assert.equal(id, "ticket-1");
      return draft;
    },
    listRecipes: async () => [],
    createRecipe: async (recipe) => {
      created.push(recipe);
    },
    newId: () => "bob-recipe-1",
    now: () => "2026-08-12T12:00:00.000Z"
  });

  assert.equal(result.status, "created");
  assert.equal(consumeCalls, 1);
  assert.equal(created.length, 1);
  assert.equal(created[0]?.id, "bob-recipe-1");
  assert.notEqual(created[0]?.ingredients[0]?.id, "alice-ing-1");
  assert.ok(created[0]?.ingredients[0]?.id);
  assert.equal(created[0]?.importSourceStableKey, undefined);
  assert.equal(getProximityModeBRetainedPayload(), null);
});

test("Bob Mode B — skip si clé/URL déjà en carnet", async () => {
  clearProximityModeBRetainedPayload();
  const key = await computeImportSourceStableKey({
    type: "URL",
    url: SOURCE_URL,
    capturedAt: "2026-08-12T00:00:00.000Z"
  });
  assert.ok(key);

  let createCalls = 0;
  let consumeCalls = 0;
  const result = await importProximityModeBAfterConfirm("ticket-dup", {
    consumeDrop: async () => {
      consumeCalls += 1;
      return sampleModeBDraft({
        source: { type: "URL", url: SOURCE_URL, capturedAt: "2026-08-12T00:00:00.000Z" }
      });
    },
    listRecipes: async () => [{ importSourceStableKey: key }],
    createRecipe: async () => {
      createCalls += 1;
    }
  });

  assert.deepEqual(result, { status: "skipped", importSourceStableKey: key });
  assert.equal(consumeCalls, 1);
  assert.equal(createCalls, 0);
});

test("Bob Mode B — sans clé → create toujours (pas de fingerprint inventé)", async () => {
  clearProximityModeBRetainedPayload();
  let createCalls = 0;
  await importProximityModeBAfterConfirm("ticket-nokey", {
    consumeDrop: async () => sampleModeBDraft({ source: undefined }),
    listRecipes: async () => [{ importSourceStableKey: "other-key" }],
    createRecipe: async () => {
      createCalls += 1;
    },
    newId: () => "bob-2"
  });
  assert.equal(createCalls, 1);
});

test("Bob Mode B — retry create depuis mémoire sans 2ᵉ GET", async () => {
  clearProximityModeBRetainedPayload();
  let consumeCalls = 0;
  let createCalls = 0;

  await assert.rejects(
    () =>
      importProximityModeBAfterConfirm("ticket-retry", {
        consumeDrop: async () => {
          consumeCalls += 1;
          return sampleModeBDraft();
        },
        listRecipes: async () => [],
        createRecipe: async () => {
          createCalls += 1;
          throw new Error("Dexie down");
        },
        newId: () => "bob-retry"
      }),
    /Dexie down/
  );

  assert.equal(consumeCalls, 1);
  assert.equal(createCalls, 1);
  assert.ok(getProximityModeBRetainedPayload());

  const result = await retryProximityModeBCreateFromMemory({
    listRecipes: async () => [],
    createRecipe: async () => {
      createCalls += 1;
    },
    newId: () => "bob-retry-2",
    now: () => "2026-08-12T12:00:00.000Z"
  });

  assert.equal(result.status, "created");
  assert.equal(consumeCalls, 1);
  assert.equal(createCalls, 2);
  if (result.status === "created") {
    assert.equal(result.recipe.id, "bob-retry-2");
  }
});

test("Annuler Mode B — miroir App : cancel n'appelle pas consumeDrop", async () => {
  let consumeCalls = 0;
  const intent = { mode: "b" as const, ticketId: "ticket-cancel", title: "Tarte" };
  const deps = {
    consumeDrop: async () => {
      consumeCalls += 1;
      return sampleModeBDraft();
    },
    listRecipes: async () => [],
    createRecipe: async () => undefined
  };

  // Miroir App `onProximityReceiveCancel` : clear + cancel session ; jamais consume/create.
  clearProximityModeBRetainedPayload();
  const session = openProximityReceiveSession({
    intent,
    isStandalone: true,
    isCapable: true
  });
  assert.equal(session.phase, "confirm");
  cancelProximityReceiveSession(session);
  assert.equal(resolveProximityPostConfirmAction(intent), "mode-b");
  assert.equal(consumeCalls, 0);

  // Contrôle positif : le spy s'incrémente si Confirmer appelait le seam.
  await importProximityModeBAfterConfirm(intent.ticketId, deps);
  assert.equal(consumeCalls, 1);
});

test("Drop indispo — GET 410/404/réseau : pas de create", async () => {
  clearProximityModeBRetainedPayload();

  for (const status of [410, 404] as const) {
    let createCalls = 0;
    const restoreFetch = mockFetchSequence([
      async () =>
        new Response(
          JSON.stringify({
            error: status === 410 ? "expired" : "not found",
            reason: status === 410 ? "expired" : "not_found"
          }),
          { status }
        )
    ]);
    try {
      await assert.rejects(
        () =>
          importProximityModeBAfterConfirm("gone", {
            consumeDrop: (id) => consumeProximityDrop(id),
            listRecipes: async () => [],
            createRecipe: async () => {
              createCalls += 1;
            }
          }),
        (err: unknown) => {
          assert.ok(err instanceof ProximityDropClientError);
          assert.equal(err.message, PROXIMITY_DROP_UNAVAILABLE_MESSAGE);
          return true;
        }
      );
      assert.equal(createCalls, 0);
      assert.equal(getProximityModeBRetainedPayload(), null);
    } finally {
      restoreFetch();
    }
  }

  let createCalls = 0;
  const restoreFetch = mockFetchSequence([
    async () => {
      throw new TypeError("Failed to fetch");
    }
  ]);
  try {
    await assert.rejects(
      () =>
        importProximityModeBAfterConfirm("offline", {
          consumeDrop: (id) => consumeProximityDrop(id),
          listRecipes: async () => [],
          createRecipe: async () => {
            createCalls += 1;
          }
        }),
      (err: unknown) => {
        assert.ok(err instanceof ProximityDropClientError);
        assert.equal(err.reason, "network");
        return true;
      }
    );
    assert.equal(createCalls, 0);
  } finally {
    restoreFetch();
  }
});

test("buildModeBDeepLink — round-trip parse", () => {
  const link = buildModeBDeepLink({
    origin: ORIGIN,
    basePath: "/",
    ticketId: "t1",
    title: "X"
  });
  assert.deepEqual(parseProximityDeepLinkSearch(new URL(link).search), {
    mode: "b",
    ticketId: "t1",
    title: "X"
  });
});

test("Alice Mode B — envelope vide (titre seul) refusée", () => {
  assert.throws(
    () =>
      recipeToProximityDropEnvelope(
        sampleLocalRecipe({
          ingredients: [],
          steps: []
        })
      ),
    /aucun contenu partageable/
  );
});

test("Bob Mode B — payload invalide / vide après consume : pas de create", async () => {
  clearProximityModeBRetainedPayload();
  for (const payload of [null, {}, { title: "" }, { title: "Seul titre", ingredients: [], steps: [] }]) {
    let createCalls = 0;
    await assert.rejects(
      () =>
        importProximityModeBAfterConfirm("bad-payload", {
          consumeDrop: async () => payload,
          listRecipes: async () => [],
          createRecipe: async () => {
            createCalls += 1;
          }
        }),
      /n'est plus disponible/
    );
    assert.equal(createCalls, 0);
    assert.equal(getProximityModeBRetainedPayload(), null);
  }
});

test("Bob Mode B — consume 200 corps vide : erreur, pas de create", async () => {
  clearProximityModeBRetainedPayload();
  let createCalls = 0;
  const restoreFetch = mockFetchSequence([
    async () => new Response("not-json", { status: 200, headers: { "Content-Type": "text/plain" } })
  ]);
  try {
    await assert.rejects(
      () =>
        importProximityModeBAfterConfirm("empty-body", {
          consumeDrop: (id) => consumeProximityDrop(id),
          listRecipes: async () => [],
          createRecipe: async () => {
            createCalls += 1;
          }
        }),
      (err: unknown) => {
        assert.ok(err instanceof ProximityDropClientError);
        assert.equal(err.reason, "invalid_response");
        return true;
      }
    );
    assert.equal(createCalls, 0);
  } finally {
    restoreFetch();
  }
});

test("Bob Mode B — retry mémoire seulement si payload retenu", async () => {
  clearProximityModeBRetainedPayload();
  await assert.rejects(
    () =>
      retryProximityModeBCreateFromMemory({
        listRecipes: async () => [],
        createRecipe: async () => undefined
      }),
    /n'est plus en mémoire/
  );

  // Miroir App : échec consume → pas de retain → pas de retry réussi.
  let createCalls = 0;
  await assert.rejects(
    () =>
      importProximityModeBAfterConfirm("no-retain", {
        consumeDrop: async () => {
          throw new ProximityDropClientError(PROXIMITY_DROP_UNAVAILABLE_MESSAGE, "network");
        },
        listRecipes: async () => [],
        createRecipe: async () => {
          createCalls += 1;
        }
      }),
    (err: unknown) => err instanceof ProximityDropClientError && err.reason === "network"
  );
  assert.equal(createCalls, 0);
  assert.equal(getProximityModeBRetainedPayload(), null);
});

/**
 * Miroir App `onProximityReceiveConfirm` Mode B : consume → create ;
 * retry mémoire si payload retenu ; surface l’erreur du retry (pas firstError).
 */
async function mirrorAppConfirmModeB(
  ticketId: string,
  deps: Parameters<typeof importProximityModeBAfterConfirm>[1]
) {
  try {
    try {
      return await importProximityModeBAfterConfirm(ticketId, deps);
    } catch (firstError) {
      if (!getProximityModeBRetainedPayload()) {
        throw firstError;
      }
      return await retryProximityModeBCreateFromMemory(deps);
    }
  } finally {
    clearProximityModeBRetainedPayload();
  }
}

test("Miroir App Confirmer Mode B — consume + create ; retry puis erreur retry", async () => {
  clearProximityModeBRetainedPayload();
  let consumeCalls = 0;
  let createCalls = 0;

  const created = await mirrorAppConfirmModeB("ticket-app", {
    consumeDrop: async (id) => {
      consumeCalls += 1;
      assert.equal(id, "ticket-app");
      return sampleModeBDraft();
    },
    listRecipes: async () => [],
    createRecipe: async () => {
      createCalls += 1;
    },
    newId: () => "bob-app-1"
  });
  assert.equal(created.status, "created");
  assert.equal(consumeCalls, 1);
  assert.equal(createCalls, 1);
  assert.equal(getProximityModeBRetainedPayload(), null);

  clearProximityModeBRetainedPayload();
  consumeCalls = 0;
  createCalls = 0;
  await assert.rejects(
    () =>
      mirrorAppConfirmModeB("ticket-app-retry", {
        consumeDrop: async () => {
          consumeCalls += 1;
          return sampleModeBDraft();
        },
        listRecipes: async () => [],
        createRecipe: async () => {
          createCalls += 1;
          if (createCalls === 1) {
            throw new Error("Dexie down first");
          }
          throw new Error("Dexie down retry");
        },
        newId: () => "bob-app-retry"
      }),
    (err: unknown) => err instanceof Error && err.message === "Dexie down retry"
  );
  assert.equal(consumeCalls, 1);
  assert.equal(createCalls, 2);
  assert.equal(getProximityModeBRetainedPayload(), null);
});

test("parseProximityModeBPayload — quantités string numériques ; isScalable strict", () => {
  const draft = parseProximityModeBPayload({
    title: "Soupe",
    ingredients: [
      { label: "Eau", quantity: "250", isScalable: "yes", unit: "ml" },
      { label: "Sel", quantity: 1, isScalable: true }
    ],
    steps: [{ text: "Bouillir." }]
  });
  assert.equal(draft.ingredients[0]?.quantity, 250);
  assert.equal(draft.ingredients[0]?.isScalable, false);
  assert.equal(draft.ingredients[1]?.isScalable, true);
});
