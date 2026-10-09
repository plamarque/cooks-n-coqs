import assert from "node:assert/strict";
import test from "node:test";
import { extractRecipeFromJsonLd } from "../src/parsing-client.js";

test("JSON-LD : les unités c. à soupe et c. à café n'amputent pas le libellé", () => {
  const draft = extractRecipeFromJsonLd(`
    <script type="application/ld+json">
      {"@type":"Recipe","name":"Test","recipeIngredient":[
        "1 c. à soupe huile d'olive",
        "1 c. à café paprika fumé",
        "1 c. à s. crème",
        "1 c. à c. sel",
        "2 cuillères à soupe farine"
      ],"recipeInstructions":["Mélanger."]}
    </script>
  `, "https://example.test/recipe");

  assert.ok(draft);
  assert.deepEqual(
    draft.ingredients.map(({ label, quantity, unit }) => ({ label, quantity, unit })),
    [
      { label: "huile d'olive", quantity: 1, unit: "c. à s." },
      { label: "paprika fumé", quantity: 1, unit: "c. à c." },
      { label: "crème", quantity: 1, unit: "c. à s." },
      { label: "sel", quantity: 1, unit: "c. à c." },
      { label: "farine", quantity: 2, unit: "c. à s." }
    ]
  );
});
