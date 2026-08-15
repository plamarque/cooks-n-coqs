import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@cookies-et-coquilettes/domain";
import {
  RECIPE_SHARE_F2_CTA,
  RECIPE_SHARE_F2_CTA_LEGACY,
  RECIPE_SHARE_F2_CTA_QUESTION,
  RECIPE_SHARE_PAGES_LEGACY,
  RECIPE_SHARE_PAGES_LIVE,
  buildRecipeShareF2Text,
  formatIngredientLineForShare,
  formatShareServingsLine,
  tryParseRecipeShareF2Text
} from "../src/utils/recipe-share-f2";

/** Corps commun corpus CAP-5 (`corpus-f2-whatsapp.md`) — sans CTA. */
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

function assertCorpusCheesecakeDraft(
  draft: NonNullable<ReturnType<typeof tryParseRecipeShareF2Text>>
): void {
  assert.equal(draft.title, "Cheesecake Framboise Sans Cuisson");
  assert.equal(draft.servingsBase, 8);
  assert.equal(draft.ingredients.length, 16);
  assert.equal(draft.steps.length, 14);
  assert.equal(draft.source?.url, LILIEBAKERY_SOURCE);
  assert.equal(draft.steps[9]?.text.includes("obnteir"), true);
  assert.ok(!JSON.stringify(draft).includes("Tu veux garder"));
  assert.ok(!JSON.stringify(draft).includes("plamarque.github.io"));
}

/** Ancien wire — encore accepté au parse. */
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

/** Nouveau wire — titre nu + `N portions`. */
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

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    title: "Tiramisu",
    category: "SUCRE",
    favorite: false,
    servingsBase: 6,
    ingredients: [
      {
        id: "i1",
        order: 1,
        label: "mascarpone",
        quantity: 500,
        quantityBase: 500,
        unit: "g",
        isScalable: true
      },
      {
        id: "i2",
        order: 2,
        label: "œufs",
        quantity: 4,
        quantityBase: 4,
        unit: "",
        isScalable: true,
        rawText: "4 œufs"
      }
    ],
    steps: [
      { id: "s2", order: 2, text: "Incorporer le mascarpone." },
      { id: "s1", order: 1, text: "Séparer les blancs des jaunes." }
    ],
    source: {
      type: "URL",
      url: "https://example.com/tiramisu",
      capturedAt: "2026-01-01T00:00:00.000Z"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

test("formatIngredientLineForShare prefers displayed quantity over rawText base", () => {
  assert.equal(
    formatIngredientLineForShare({
      id: "x",
      label: "oeufs",
      quantity: 3,
      unit: "pièces",
      isScalable: true,
      rawText: "4 œufs"
    }),
    "3 pièces oeufs"
  );
});

test("formatIngredientLineForShare falls back to rawText when no displayed quantity", () => {
  assert.equal(
    formatIngredientLineForShare({
      id: "x",
      label: "sel",
      isScalable: false,
      rawText: "une pincée de sel"
    }),
    "une pincée de sel"
  );
});

test("formatIngredientLineForShare builds qty unit label", () => {
  assert.equal(
    formatIngredientLineForShare({
      id: "x",
      label: "mascarpone",
      quantity: 250,
      unit: "g",
      isScalable: true
    }),
    "250 g mascarpone"
  );
});

test("formatShareServingsLine omits when absent", () => {
  assert.equal(formatShareServingsLine(undefined), null);
  assert.equal(formatShareServingsLine(null), null);
  assert.equal(formatShareServingsLine(0), null);
  assert.equal(formatShareServingsLine(6), "6 portions");
  assert.equal(formatShareServingsLine(1), "1 portion");
  assert.equal(formatShareServingsLine(6.5), "6,5 portions");
  assert.equal(formatShareServingsLine(0.4), "0,4 portions");
});

test("buildRecipeShareF2Text emits bare title, N portions, CTA last", () => {
  const text = buildRecipeShareF2Text(baseRecipe());
  assert.equal(
    text,
    [
      "Tiramisu",
      "6 portions",
      "",
      "Ingrédients:",
      "- 500 g mascarpone",
      "- 4 œufs",
      "",
      "Étapes:",
      "1. Séparer les blancs des jaunes.",
      "2. Incorporer le mascarpone.",
      "",
      "Source:",
      "https://example.com/tiramisu",
      "",
      RECIPE_SHARE_F2_CTA
    ].join("\n")
  );
});

test("buildRecipeShareF2Text — CAP-7 base 1 / affichage 4 → 4 portions + qty affichées", () => {
  const recipe = baseRecipe({
    title: "Pâte",
    servingsBase: 1,
    servingsCurrent: 4,
    source: undefined,
    ingredients: [
      {
        id: "i1",
        order: 1,
        label: "farine",
        quantity: 400,
        quantityBase: 100,
        unit: "g",
        isScalable: true,
        rawText: "100 g farine"
      },
      {
        id: "i2",
        order: 2,
        label: "œufs",
        quantity: 2,
        quantityBase: 0.5,
        unit: "",
        isScalable: true,
        rawText: "0,5 œufs"
      }
    ],
    steps: [{ id: "s1", order: 1, text: "Mélanger." }]
  });
  const before = structuredClone(recipe);
  const text = buildRecipeShareF2Text(recipe);
  assert.equal(
    text,
    [
      "Pâte",
      "4 portions",
      "",
      "Ingrédients:",
      "- 400 g farine",
      "- 2 œufs",
      "",
      "Étapes:",
      "1. Mélanger.",
      "",
      RECIPE_SHARE_F2_CTA
    ].join("\n")
  );
  assert.deepEqual(recipe, before);
  assert.equal(recipe.servingsBase, 1);
  assert.equal(recipe.ingredients[0]?.quantityBase, 100);
});

test("buildRecipeShareF2Text — sans servingsCurrent utilise servingsBase", () => {
  const text = buildRecipeShareF2Text(baseRecipe({ servingsBase: 6, servingsCurrent: undefined }));
  assert.ok(text.split("\n").includes("6 portions"));
});

test("buildRecipeShareF2Text omits portions line and Source when absent", () => {
  const text = buildRecipeShareF2Text(
    baseRecipe({
      servingsBase: undefined,
      source: { type: "MANUAL", capturedAt: "2026-01-01T00:00:00.000Z" }
    })
  );
  assert.ok(!text.includes("Portions:"));
  assert.ok(!/\d+\s+portions?/i.test(text.split("\n").slice(0, 3).join("\n")));
  assert.ok(!text.includes("Source:"));
  assert.ok(text.startsWith("Tiramisu\n\nIngrédients:"));
  assert.ok(text.endsWith(RECIPE_SHARE_F2_CTA));
});

test("buildRecipeShareF2Text omits non-http Source", () => {
  const text = buildRecipeShareF2Text(
    baseRecipe({
      source: {
        type: "TEXT",
        url: "not-a-url",
        capturedAt: "2026-01-01T00:00:00.000Z"
      }
    })
  );
  assert.ok(!text.includes("Source:"));
});

test("buildRecipeShareF2Text CTA is exactly one trailing line", () => {
  const text = buildRecipeShareF2Text(baseRecipe({ servingsBase: undefined, source: undefined }));
  const lines = text.split("\n");
  assert.equal(lines[lines.length - 1], RECIPE_SHARE_F2_CTA);
  assert.equal(lines.filter((l) => l.startsWith("Tu veux garder")).length, 1);
});

test("tryParseRecipeShareF2Text — nouveau wire Tiramisu", () => {
  const draft = tryParseRecipeShareF2Text(TIRAMISU_F2_TEXT);
  assert.ok(draft);
  assert.equal(draft.title, "Tiramisu");
  assert.equal(draft.servingsBase, 6);
  assert.equal(draft.ingredients.length, 6);
  assert.equal(draft.steps.length, 6);
  assert.equal(draft.source?.url, "https://example.com/tiramisu");
  assert.equal(draft.ingredients[0]?.rawText, "500 g mascarpone");
  assert.equal(draft.steps[0]?.text, "Séparer les blancs des jaunes.");
  assert.ok(!draft.ingredients.some((i) => (i.rawText ?? i.label).includes("Tu veux garder")));
  assert.ok(!draft.steps.some((s) => s.text.includes("Tu veux garder")));
});

test("tryParseRecipeShareF2Text — ancien wire Titre:/Portions:", () => {
  const draft = tryParseRecipeShareF2Text(TIRAMISU_F2_TEXT_LEGACY);
  assert.ok(draft);
  assert.equal(draft.title, "Tiramisu");
  assert.equal(draft.servingsBase, 6);
  assert.equal(draft.ingredients.length, 6);
  assert.equal(draft.steps.length, 6);
  assert.equal(draft.source?.url, "https://example.com/tiramisu");
});

test("tryParseRecipeShareF2Text — CTA ignorée, pas source.url", () => {
  const draft = tryParseRecipeShareF2Text(TIRAMISU_F2_TEXT);
  assert.ok(draft);
  assert.equal(draft.source?.url, "https://example.com/tiramisu");
  assert.notEqual(
    draft.source?.url,
    "https://plamarque.github.io/cookies-et-coquilettes/"
  );
  assert.notEqual(draft.source?.url, "https://plamarque.github.io/cooks-n-coqs/");
  assert.ok(!JSON.stringify(draft).includes(RECIPE_SHARE_F2_CTA));
});

test("tryParseRecipeShareF2Text — CTA historique ignorée, pas source.url Pages", () => {
  const text = [
    "Soupe",
    "2 portions",
    "",
    "Ingrédients:",
    "- 1 oignon",
    "",
    "Étapes:",
    "1. Couper.",
    "",
    RECIPE_SHARE_F2_CTA_LEGACY
  ].join("\n");
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.title, "Soupe");
  assert.equal(draft.servingsBase, 2);
  assert.equal(draft.ingredients.length, 1);
  assert.equal(draft.steps.length, 1);
  assert.equal(draft.source?.url, undefined);
  assert.ok(!JSON.stringify(draft).includes(RECIPE_SHARE_F2_CTA_LEGACY));
  assert.ok(!draft.ingredients.some((i) => (i.rawText ?? i.label).includes("Tu veux garder")));
  assert.ok(!draft.steps.some((s) => s.text.includes("Tu veux garder")));
});

test("buildRecipeShareF2Text — CTA émise sur origine cooks-n-coqs", () => {
  const text = buildRecipeShareF2Text(baseRecipe());
  const lines = text.split("\n");
  assert.equal(
    lines[lines.length - 1],
    "Tu veux garder cette recette ? https://plamarque.github.io/cooks-n-coqs/"
  );
});

test("tryParseRecipeShareF2Text — sans portions (nouveau)", () => {
  const text = [
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
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.title, "Soupe");
  assert.equal(draft.servingsBase, undefined);
  assert.equal(draft.ingredients.length, 1);
  assert.equal(draft.steps.length, 1);
});

test("tryParseRecipeShareF2Text — ancien wire sans Portions:", () => {
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
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.title, "Soupe");
  assert.equal(draft.servingsBase, undefined);
  assert.equal(draft.ingredients.length, 1);
  assert.equal(draft.steps.length, 1);
});

test("tryParseRecipeShareF2Text — hybride Titre: + ligne N portions en préambule", () => {
  const text = [
    "4 portions",
    "",
    "Titre:",
    "Soupe",
    "",
    "Ingrédients:",
    "- 1 oignon",
    "",
    "Étapes:",
    "1. Couper."
  ].join("\n");
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.title, "Soupe");
  assert.equal(draft.servingsBase, 4);
});

test("tryParseRecipeShareF2Text — singular 1 portion + round-trip emit", () => {
  const text = buildRecipeShareF2Text(
    baseRecipe({
      servingsBase: 1,
      source: undefined
    })
  );
  assert.ok(text.split("\n").includes("1 portion"));
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.title, "Tiramisu");
  assert.equal(draft.servingsBase, 1);
});

test("tryParseRecipeShareF2Text — portions décimales en préambule", () => {
  const text = [
    "Soupe",
    "6,5 portions",
    "",
    "Ingrédients:",
    "- 1 oignon",
    "",
    "Étapes:",
    "1. Couper."
  ].join("\n");
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.title, "Soupe");
  assert.equal(draft.servingsBase, 6.5);
});

test("buildRecipeShareF2Text — servingsBase 6.5 round-trip sans arrondi", () => {
  const text = buildRecipeShareF2Text(
    baseRecipe({
      servingsBase: 6.5,
      source: undefined
    })
  );
  assert.ok(text.split("\n").includes("6,5 portions"));
  assert.ok(!text.split("\n").includes("7 portions"));
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.servingsBase, 6.5);
});

test("tryParseRecipeShareF2Text — sans Source", () => {
  const text = [
    "Soupe",
    "2 portions",
    "",
    "Ingrédients:",
    "- 1 oignon",
    "",
    "Étapes:",
    "1. Couper."
  ].join("\n");
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.source?.url, undefined);
  assert.equal(draft.servingsBase, 2);
});

test("tryParseRecipeShareF2Text — non-F2 → null", () => {
  assert.equal(tryParseRecipeShareF2Text("Voici ma super soupe à l'oignon"), null);
  assert.equal(tryParseRecipeShareF2Text("https://example.com/recette"), null);
  assert.equal(tryParseRecipeShareF2Text(""), null);
});

test("tryParseRecipeShareF2Text — titre seul sans ingrédients ni étapes → null", () => {
  const text = ["Vide", "", RECIPE_SHARE_F2_CTA].join("\n");
  assert.equal(tryParseRecipeShareF2Text(text), null);
  assert.equal(tryParseRecipeShareF2Text(["Titre:", "Vide", "", RECIPE_SHARE_F2_CTA].join("\n")), null);
});

test("tryParseRecipeShareF2Text — sourceType SHARE pour share_target", () => {
  const draft = tryParseRecipeShareF2Text(TIRAMISU_F2_TEXT, { sourceType: "SHARE" });
  assert.ok(draft);
  assert.equal(draft.source?.type, "SHARE");
  assert.equal(draft.source?.url, "https://example.com/tiramisu");
});

test("tryParseRecipeShareF2Text — corpus A (CTA legacy une ligne)", () => {
  const draft = tryParseRecipeShareF2Text(CORPUS_F2_A);
  assert.ok(draft);
  assertCorpusCheesecakeDraft(draft);
});

test("tryParseRecipeShareF2Text — corpus B (CTA cooks-n-coqs une ligne)", () => {
  const draft = tryParseRecipeShareF2Text(CORPUS_F2_B);
  assert.ok(draft);
  assertCorpusCheesecakeDraft(draft);
});

test("tryParseRecipeShareF2Text — corpus C wrap CTA live", () => {
  const draft = tryParseRecipeShareF2Text(CORPUS_F2_C_LIVE);
  assert.ok(draft);
  assertCorpusCheesecakeDraft(draft);
});

test("tryParseRecipeShareF2Text — corpus C wrap CTA legacy", () => {
  const draft = tryParseRecipeShareF2Text(CORPUS_F2_C_LEGACY);
  assert.ok(draft);
  assertCorpusCheesecakeDraft(draft);
});

/** F2 sans Source: — le wrap non strippé polluerait Étapes ; prouve le strip wrap. */
const F2_NO_SOURCE_BODY = [
  "Soupe",
  "2 portions",
  "",
  "Ingrédients:",
  "- 1 oignon",
  "",
  "Étapes:",
  "1. Couper."
].join("\n");

function assertWrapStrippedFromSteps(
  draft: NonNullable<ReturnType<typeof tryParseRecipeShareF2Text>>
): void {
  assert.equal(draft.title, "Soupe");
  assert.equal(draft.servingsBase, 2);
  assert.equal(draft.ingredients.length, 1);
  assert.equal(draft.steps.length, 1);
  assert.equal(draft.steps[0]?.text, "Couper.");
  assert.equal(draft.source?.url, undefined);
  assert.ok(!draft.steps.some((s) => s.text.includes("Tu veux garder")));
  assert.ok(!draft.steps.some((s) => s.text.includes("plamarque.github.io")));
  assert.ok(!JSON.stringify(draft).includes("Tu veux garder"));
  assert.ok(!JSON.stringify(draft).includes("plamarque.github.io"));
}

test("tryParseRecipeShareF2Text — wrap CTA live sans Source: hors étapes", () => {
  const text = `${F2_NO_SOURCE_BODY}\n\n${RECIPE_SHARE_F2_CTA_QUESTION}\n${RECIPE_SHARE_PAGES_LIVE}`;
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assertWrapStrippedFromSteps(draft);
});

test("tryParseRecipeShareF2Text — wrap CTA legacy sans Source: hors étapes", () => {
  const text = `${F2_NO_SOURCE_BODY}\n\n${RECIPE_SHARE_F2_CTA_QUESTION}\n${RECIPE_SHARE_PAGES_LEGACY}`;
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assertWrapStrippedFromSteps(draft);
});

test("tryParseRecipeShareF2Text — wrap CTA avec blancs entre question et URL", () => {
  const text = `${F2_NO_SOURCE_BODY}\n\n${RECIPE_SHARE_F2_CTA_QUESTION}\n\n\n${RECIPE_SHARE_PAGES_LIVE}`;
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assertWrapStrippedFromSteps(draft);
});

test("tryParseRecipeShareF2Text — Pages jamais source.url même seule sous Source:", () => {
  const text = [
    "Soupe",
    "2 portions",
    "",
    "Ingrédients:",
    "- 1 oignon",
    "",
    "Étapes:",
    "1. Couper.",
    "",
    "Source:",
    RECIPE_SHARE_PAGES_LIVE,
    "",
    RECIPE_SHARE_F2_CTA_QUESTION,
    RECIPE_SHARE_PAGES_LEGACY
  ].join("\n");
  const draft = tryParseRecipeShareF2Text(text);
  assert.ok(draft);
  assert.equal(draft.source?.url, undefined);
  assert.ok(!JSON.stringify(draft).includes("plamarque.github.io"));
});
