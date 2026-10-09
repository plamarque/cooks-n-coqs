import assert from "node:assert/strict";
import test from "node:test";
import { extractChatGptShareRecipeText } from "../src/parsing-client.js";

test("partage ChatGPT : extrait le bloc recette du bootstrap sans conserver le chrome", () => {
  const recipe = `# Œufs à la coque et mouillettes\n\n## Ingrédients\n\n- 4 œufs frais\n- 4 tranches de pain de mie\n\n## Préparation\n\n1. Porter l'eau à ébullition.\n2. Cuire les œufs 3 minutes.`;
  const html = `<html><body><script>JSON.parse(${JSON.stringify(JSON.stringify(["loaderData", { content: recipe }]))})</script><main>ChatGPT</main></body></html>`;

  assert.equal(extractChatGptShareRecipeText(html), recipe);
});

test("partage ChatGPT : ignore un bootstrap sans structure de recette", () => {
  const html = `<script>${JSON.stringify("# Discussion\n\nTexte général sans recette")}</script>`;
  assert.equal(extractChatGptShareRecipeText(html), undefined);
});
