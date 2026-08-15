import assert from "node:assert/strict";
import test from "node:test";
import { bffImportService, generateRecipeImage } from "../src/services/import-service";
import {
  RECIPE_SHARE_F2_CTA,
  RECIPE_SHARE_F2_CTA_LEGACY,
  RECIPE_SHARE_F2_CTA_QUESTION,
  RECIPE_SHARE_PAGES_LEGACY,
  RECIPE_SHARE_PAGES_LIVE
} from "../src/utils/recipe-share-f2";

/** Corps commun corpus CAP-5 — sans CTA. */
const CORPUS_CHEESECAKE_BODY = [
  "Cheesecake Framboise Sans Cuisson",
  "8 portions",
  "",
  "Ingrédients:",
  "- 230 g galettes bretonnes",
  "- 80 g beurre doux fondu",
  "- 2 feuilles gélatine (Vahiné)",
  "- 150 g fromage frais Philadelphia",
  "- 320 g mascarpone",
  "- 1 c. à c. extrait naturel de vanille",
  "- 95 g sucre en poudre classique",
  "- 320 g crème liquide entière 30%mg (bien froide)",
  "- 2 cs lait",
  "- 100 g framboises fraîches",
  "- 250 g framboises fraîches ou décongelées",
  "- 50 g sucre en poudre",
  "- 1 c. à c. jus de citron jaune",
  "- 1 cs maïzena",
  "- 2 cs eau froide",
  "- 100 g framboises fraîches",
  "",
  "Étapes:",
  "1. Dans un mixeur, réduire les biscuits en miettes. Faire fondre le beurre au micro-ondes puis mélanger aux biscuits mixés.",
  "2. Tasser les biscuits mixés dans le fond d’un moule à charnière de 20cm (j’ajoute avant un film rhodoïd pour faciliter le démoulage du cheesecake). Bien appuyer à l’aide du dos d’une cuillère ou d’un verre. Réfrigérer en attendant la suite.",
  "3. Faire ramollir la gélatine dans de l’eau froide.",
  "4. Dans un récipient ou au robot, fouetter bien ferme le Philadelphia, le mascarpone, la vanille et le sucre en poudre.",
  "5. A part, fouetter la crème liquide en chantilly bien ferme aussi.",
  "6. Dans une toute petite casserole, chauffer le lait et y faire fondre hors du feu la gélatine bien égouttée.",
  "7. Déposer la crème chantilly dans le mélange de fromage frais puis fouetter pour bien homogénéiser la texture. Cette garniture doit déjà bien se tenir.",
  "8. Verser le lait tiédi et fouetter à nouveau pour avoir un mélange homogène.",
  "9. Déposer la moitié de cette garniture dans le moule, sur la couche de biscuits tassés. Ajouter les framboises fraîches en les appuyant légèrement. Verser ensuite le reste de garniture. Lisser le dessus à l’aide d’une petite spatule. Réfrigérer toute une nuit.",
  "10. Déposer les framboises dans le bol du mixeur. Mixer jusqu’à obnteir un coulis. Passez ce coulis au chinois pour enlever les pépins.",
  "11. Dans une casserole, chauffer feu moyen le coulis avec le sucre en poudre et le jus de citron jusqu’à début d’ébullition.",
  "12. A part, mélanger la maïzena et l’eau froide puis verser dans la casserole de coulis en chauffant à feu doux-moyen. Remuer avec une cuillère en bois jusqu’à ce que le coulis épaississe et nappe la cuillère. Retirer du feu et laisser refroidir complètement.",
  "13. Déposer le cheesecake sur son plat de service. Ajouter le coulis refroidi sur le dessus à l’aide d’une cuillère à soupe. Ajouter des framboises fraîches.",
  "14. Servir immédiatement ou garder au réfrigérateur jusqu’à dégustation.",
  "",
  "Source:",
  "https://liliebakery.fr/cheesecake-framboise-sans-cuisson/"
].join("\n");

const CORPUS_F2_A = `${CORPUS_CHEESECAKE_BODY}\n\n${RECIPE_SHARE_F2_CTA_LEGACY}`;
const CORPUS_F2_B = `${CORPUS_CHEESECAKE_BODY}\n\n${RECIPE_SHARE_F2_CTA}`;
const CORPUS_F2_C_LIVE = `${CORPUS_CHEESECAKE_BODY}\n\n${RECIPE_SHARE_F2_CTA_QUESTION}\n${RECIPE_SHARE_PAGES_LIVE}`;
const CORPUS_F2_C_LEGACY = `${CORPUS_CHEESECAKE_BODY}\n\n${RECIPE_SHARE_F2_CTA_QUESTION}\n${RECIPE_SHARE_PAGES_LEGACY}`;

const LILIEBAKERY_SOURCE = "https://liliebakery.fr/cheesecake-framboise-sans-cuisson/";

/** Nouveau wire F2. */
const TIRAMISU_F2_TEXT = [
  "Tiramisu",
  "6 portions",
  "",
  "Ingrédients:",
  "- 500 g mascarpone",
  "- 4 œufs",
  "- 100 g sucre",
  "- 24 biscuits à la cuillère",
  "- 30 cl café serré",
  "- 2 c.à.s cacao amer",
  "",
  "Étapes:",
  "1. Séparer les blancs des jaunes.",
  "2. Blanchir les jaunes avec le sucre.",
  "3. Incorporer le mascarpone.",
  "4. Monter les blancs en neige et plier.",
  "5. Tremper les biscuits dans le café, alterner couches.",
  "6. Saupoudrer de cacao et réserver au frais 4 h.",
  "",
  "Source:",
  "https://example.com/tiramisu",
  "",
  RECIPE_SHARE_F2_CTA
].join("\n");

/** Ancien wire — dual parse. */
const TIRAMISU_F2_TEXT_LEGACY = [
  "Titre:",
  "Tiramisu",
  "",
  "Portions:",
  "6",
  "",
  "Ingrédients:",
  "- 500 g mascarpone",
  "- 4 œufs",
  "",
  "Étapes:",
  "1. Séparer les blancs des jaunes.",
  "",
  RECIPE_SHARE_F2_CTA
].join("\n");

function withMockedFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): { restore: () => void; callCount: () => number; urls: () => string[] } {
  const original = globalThis.fetch;
  let calls = 0;
  const urls: string[] = [];
  globalThis.fetch = async (input, init) => {
    calls += 1;
    urls.push(String(input));
    return handler(input, init);
  };
  return {
    restore: () => {
      globalThis.fetch = original;
    },
    callCount: () => calls,
    urls: () => urls
  };
}

async function assertCorpusImportZeroFetch(text: string): Promise<void> {
  const mock = withMockedFetch(async () => {
    throw new Error("fetch ne doit pas être appelé pour F2");
  });
  try {
    const draft = await bffImportService.importFromText(text);
    assert.equal(draft.title, "Cheesecake Framboise Sans Cuisson");
    assert.equal(draft.servingsBase, 8);
    assert.equal(draft.ingredients.length, 16);
    assert.equal(draft.steps.length, 14);
    assert.equal(draft.source?.url, LILIEBAKERY_SOURCE);
    assert.equal(draft.source?.type, "TEXT");
    assert.equal(mock.callCount(), 0);
    assert.ok(!mock.urls().some((u) => u.includes("liliebakery")));
    assert.ok(!mock.urls().some((u) => u.includes("plamarque.github.io")));
  } finally {
    mock.restore();
  }
}

test("importFromText F2 Tiramisu (nouveau) — draft local, 0 fetch", async () => {
  const mock = withMockedFetch(async () => {
    throw new Error("fetch ne doit pas être appelé pour F2");
  });
  try {
    const draft = await bffImportService.importFromText(TIRAMISU_F2_TEXT);
    assert.equal(draft.title, "Tiramisu");
    assert.equal(draft.servingsBase, 6);
    assert.equal(draft.ingredients.length, 6);
    assert.equal(draft.steps.length, 6);
    assert.equal(draft.source?.url, "https://example.com/tiramisu");
    assert.equal(draft.source?.type, "TEXT");
    assert.equal(mock.callCount(), 0);
  } finally {
    mock.restore();
  }
});

test("importFromText F2 Tiramisu (ancien Titre:/Portions:) — draft local", async () => {
  const mock = withMockedFetch(async () => {
    throw new Error("fetch ne doit pas être appelé pour F2");
  });
  try {
    const draft = await bffImportService.importFromText(TIRAMISU_F2_TEXT_LEGACY);
    assert.equal(draft.title, "Tiramisu");
    assert.equal(draft.servingsBase, 6);
    assert.equal(draft.ingredients.length, 2);
    assert.equal(draft.steps.length, 1);
    assert.equal(mock.callCount(), 0);
  } finally {
    mock.restore();
  }
});

test("importFromText F2 ancien sans Portions: — servingsBase undefined", async () => {
  const text = [
    "Titre:",
    "Soupe",
    "",
    "Ingrédients:",
    "- 1 oignon",
    "",
    "Étapes:",
    "1. Couper.",
    "",
    RECIPE_SHARE_F2_CTA
  ].join("\n");
  const mock = withMockedFetch(async () => {
    throw new Error("fetch ne doit pas être appelé pour F2");
  });
  try {
    const draft = await bffImportService.importFromText(text);
    assert.equal(draft.title, "Soupe");
    assert.equal(draft.servingsBase, undefined);
    assert.equal(draft.ingredients.length, 1);
    assert.equal(draft.steps.length, 1);
    assert.equal(mock.callCount(), 0);
  } finally {
    mock.restore();
  }
});

test("importFromShare F2 Tiramisu — draft local SHARE, 0 fetch", async () => {
  const mock = withMockedFetch(async () => {
    throw new Error("fetch ne doit pas être appelé pour F2");
  });
  try {
    const draft = await bffImportService.importFromShare({ text: TIRAMISU_F2_TEXT });
    assert.equal(draft.title, "Tiramisu");
    assert.equal(draft.ingredients.length, 6);
    assert.equal(draft.steps.length, 6);
    assert.equal(draft.source?.type, "SHARE");
    assert.equal(draft.source?.url, "https://example.com/tiramisu");
    assert.equal(mock.callCount(), 0);
  } finally {
    mock.restore();
  }
});

test("importFromShare F2 ancien Titre:/Portions: — draft local SHARE", async () => {
  const mock = withMockedFetch(async () => {
    throw new Error("fetch ne doit pas être appelé pour F2");
  });
  try {
    const draft = await bffImportService.importFromShare({ text: TIRAMISU_F2_TEXT_LEGACY });
    assert.equal(draft.title, "Tiramisu");
    assert.equal(draft.servingsBase, 6);
    assert.equal(draft.ingredients.length, 2);
    assert.equal(draft.steps.length, 1);
    assert.equal(draft.source?.type, "SHARE");
    assert.equal(mock.callCount(), 0);
  } finally {
    mock.restore();
  }
});

test("importFromText non-F2 — fetch BFF appelé", async () => {
  const mock = withMockedFetch(async () => {
    return new Response(
      JSON.stringify({
        title: "Depuis BFF",
        category: "SALE",
        ingredients: [],
        steps: [{ id: "s1", order: 1, text: "Mélanger." }]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  });
  try {
    const draft = await bffImportService.importFromText("Voici ma super soupe à l'oignon");
    assert.equal(mock.callCount(), 1);
    assert.equal(draft.title, "Depuis BFF");
  } finally {
    mock.restore();
  }
});

test("importFromText corpus A — draft local liliebakery, 0 fetch", async () => {
  await assertCorpusImportZeroFetch(CORPUS_F2_A);
});

test("importFromText corpus B — draft local, 0 fetch", async () => {
  await assertCorpusImportZeroFetch(CORPUS_F2_B);
});

test("importFromText corpus C wrap live — 0 fetch, Pages hors source", async () => {
  await assertCorpusImportZeroFetch(CORPUS_F2_C_LIVE);
});

test("importFromText corpus C wrap legacy — 0 fetch, Pages hors source", async () => {
  await assertCorpusImportZeroFetch(CORPUS_F2_C_LEGACY);
});

test("importFromShare corpus C — SHARE local, Source http(s) sans re-fetch", async () => {
  const mock = withMockedFetch(async () => {
    throw new Error("fetch ne doit pas être appelé pour F2");
  });
  try {
    const draft = await bffImportService.importFromShare({ text: CORPUS_F2_C_LIVE });
    assert.equal(draft.title, "Cheesecake Framboise Sans Cuisson");
    assert.equal(draft.source?.url, LILIEBAKERY_SOURCE);
    assert.equal(draft.source?.type, "SHARE");
    assert.equal(mock.callCount(), 0);
  } finally {
    mock.restore();
  }
});

/**
 * Matrix CAP-5 « Image async » : import F2 déjà réussi ; échec génération image
 * (réseau / HTTP) → soft-fail (`undefined`, pas de throw) — la fiche reste créée.
 * Miroir du fire-and-forget `startAsyncImageForRecipe` dans App.vue.
 */
test("image background soft-fail after F2 import — generateRecipeImage échoue sans invalider le draft", async () => {
  const importMock = withMockedFetch(async () => {
    throw new Error("fetch ne doit pas être appelé pour F2");
  });
  let draft: Awaited<ReturnType<typeof bffImportService.importFromText>>;
  try {
    draft = await bffImportService.importFromText(CORPUS_F2_B);
    assert.equal(draft.title, "Cheesecake Framboise Sans Cuisson");
    assert.equal(draft.ingredients.length, 16);
    assert.equal(draft.steps.length, 14);
    assert.equal(importMock.callCount(), 0);
  } finally {
    importMock.restore();
  }

  const networkFail = withMockedFetch(async () => {
    throw new Error("réseau indisponible");
  });
  try {
    const imageUrl = await generateRecipeImage({
      title: draft.title,
      ingredients: draft.ingredients,
      steps: draft.steps
    });
    assert.equal(imageUrl, undefined);
    assert.equal(networkFail.callCount(), 1);
  } finally {
    networkFail.restore();
  }

  const httpFail = withMockedFetch(async () => new Response("boom", { status: 503 }));
  try {
    const imageUrl = await generateRecipeImage({
      title: draft.title,
      ingredients: draft.ingredients,
      steps: draft.steps
    });
    assert.equal(imageUrl, undefined);
    assert.equal(httpFail.callCount(), 1);
  } finally {
    httpFail.restore();
  }

  // Fiche (draft) toujours intacte après soft-fail image.
  assert.equal(draft.title, "Cheesecake Framboise Sans Cuisson");
  assert.equal(draft.source?.url, LILIEBAKERY_SOURCE);
  assert.equal(draft.ingredients.length, 16);
  assert.equal(draft.steps.length, 14);
});
