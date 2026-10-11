import assert from "node:assert/strict";
import test from "node:test";
import { toChefRecipeExcerpt } from "../src/utils/chef-mcp-local.ts";

test("l'extrait MCP local d'une recette ne révèle ni id, source ni image", () => {
  const excerpt = toChefRecipeExcerpt({
    title: "Blanquette",
    ingredients: [{ id: "ingredient-local", label: "veau", isScalable: false }],
    steps: [{ id: "step-local", order: 1, text: "Cuire doucement", media: [] }]
  });
  assert.deepEqual(excerpt, {
    title: "Blanquette",
    ingredients: ["veau"],
    steps: ["Cuire doucement"]
  });
  assert.equal("id" in excerpt, false);
  assert.equal("source" in excerpt, false);
  assert.equal("imageId" in excerpt, false);
});
