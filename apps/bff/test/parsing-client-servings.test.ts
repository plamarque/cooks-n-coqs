import assert from "node:assert/strict";
import test from "node:test";
import {
  extractRecipeFromJsonLd,
  extractServingsFromHtml,
  parseServings
} from "../src/parsing-client.js";

function recipeHtml(recipe: Record<string, unknown>, bodyExtra = ""): string {
  return `<!DOCTYPE html><html><head>
<meta name="description" content="Recette test" />
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Recette test",
    recipeIngredient: ["200 g farine"],
    recipeInstructions: ["Mélanger."],
    ...recipe
  })}</script>
</head><body><main>${bodyExtra}</main></body></html>`;
}

test("parseServings: Marmiton-like string « 4 bons appétits »", () => {
  assert.equal(parseServings("4 bons appétits"), 4);
});

test("parseServings: Galbani-like string « 4 personnes »", () => {
  assert.equal(parseServings("4 personnes"), 4);
});

test("parseServings: tableau de strings", () => {
  assert.equal(parseServings(["6 portions"]), 6);
});

test("parseServings: QuantitativeValue numérique", () => {
  assert.equal(
    parseServings({ "@type": "QuantitativeValue", value: 2 }),
    2
  );
});

test("parseServings: yield non numérique → absent", () => {
  assert.equal(parseServings("à volonté"), undefined);
});

test("parseServings: nombre et QuantitativeValue string", () => {
  assert.equal(parseServings(8), 8);
  assert.equal(parseServings({ value: "3 portions" }), 3);
});

test("extractRecipeFromJsonLd: Marmiton yield string → servingsBase 4", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml({ recipeYield: "4 bons appétits" }),
    "https://www.marmiton.org/recettes/test"
  );
  assert.ok(draft);
  assert.equal(draft!.servingsBase, 4);
});

test("extractRecipeFromJsonLd: Galbani yield string → servingsBase 4", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml({ recipeYield: "4 personnes" }),
    "https://www.galbani.fr/recette/tiramisu"
  );
  assert.ok(draft);
  assert.equal(draft!.servingsBase, 4);
});

test("extractRecipeFromJsonLd: sans recipeYield, HTML « 8 personnes » → 8", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml({}, "<p>Pour 8 personnes</p>"),
    "https://example.com/r"
  );
  assert.ok(draft);
  assert.equal(draft!.servingsBase, 8);
});

test("extractRecipeFromJsonLd: yield « à volonté » + HTML « 8 personnes » → fallback 8", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml({ recipeYield: "à volonté" }, "<p>Pour 8 personnes</p>"),
    "https://example.com/r"
  );
  assert.ok(draft);
  assert.equal(draft!.servingsBase, 8);
});

test("extractRecipeFromJsonLd: aucune indication → servingsBase absent", () => {
  const draft = extractRecipeFromJsonLd(
    recipeHtml({}, "<p>Une bonne recette.</p>"),
    "https://example.com/r"
  );
  assert.ok(draft);
  assert.equal(draft!.servingsBase, undefined);
});

test("extractServingsFromHtml: motifs FR", () => {
  assert.equal(extractServingsFromHtml("4 bons appétits"), 4);
  assert.equal(extractServingsFromHtml("environ 6 portions"), 6);
  assert.equal(extractServingsFromHtml("2 pers."), 2);
  assert.equal(extractServingsFromHtml("rien ici"), undefined);
});
