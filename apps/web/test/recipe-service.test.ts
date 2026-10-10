import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@cookies-et-coquilettes/domain";
import { dexieRecipeService, compareRecipesByNotebookTitle, filterAndSortNotebookRecipes, shouldProxyImageUrl } from "../src/services/recipe-service";
import { db } from "../src/storage/db";

function recipe(id: string, title: string): Recipe {
  return {
    id,
    title,
    category: "SALE",
    favorite: false,
    ingredients: [{ id: `${id}-ingredient`, label: "farine", isScalable: false }],
    steps: [],
    createdAt: "2026-10-09T00:00:00.000Z",
    updatedAt: "2026-10-09T00:00:00.000Z"
  };
}

test("tri du Cahier : titres français insensibles aux accents et à la casse, puis id", () => {
  const recipes = [
    recipe("z-equivalent", "Éclair"),
    recipe("b-brownie", "brownie"),
    recipe("a-equivalent", "eCLAIR"),
    recipe("a-apple", "Abricot")
  ];

  assert.deepEqual(
    recipes.sort(compareRecipesByNotebookTitle).map(({ id }) => id),
    ["a-apple", "b-brownie", "a-equivalent", "z-equivalent"]
  );
});

test("Cahier filtré : le titre prévaut sur favori et date de modification", () => {
  const recipes = [
    { ...recipe("favorite-z", "Zeste"), favorite: true, updatedAt: "2026-10-09T00:00:00.000Z" },
    { ...recipe("ordinary-a", "Abricot"), updatedAt: "2024-01-01T00:00:00.000Z" },
    { ...recipe("other-category", "Ananas"), category: "SUCRE" as const },
    { ...recipe("search-miss", "Brioche"), ingredients: [{ id: "search-miss-ingredient", label: "eau", isScalable: false }] }
  ];

  assert.deepEqual(
    filterAndSortNotebookRecipes(recipes, { category: "SALE", search: "farine" }).map(({ id }) => id),
    ["ordinary-a", "favorite-z"]
  );
  assert.deepEqual(
    filterAndSortNotebookRecipes(recipes, { favorite: true }).map(({ id }) => id),
    ["favorite-z"]
  );
});

test("Cahier filtré : une catégorie personnelle est insensible à la casse et aux accents", () => {
  const recipes = [{ ...recipe("soupe", "Soupe"), personalCategories: ["Soupes"] }, { ...recipe("pates", "Pâtes"), personalCategories: ["Pâtes"] }];
  assert.deepEqual(filterAndSortNotebookRecipes(recipes, { personalCategory: "soupes" }).map(({ id }) => id), ["soupe"]);
});

test("listRecipes : lecture Dexie filtrée et triée par titre", async () => {
  const recipes = [
    { ...recipe("favorite-z", "Zeste"), favorite: true, updatedAt: "2026-10-09T00:00:00.000Z" },
    { ...recipe("ordinary-a", "Abricot"), updatedAt: "2024-01-01T00:00:00.000Z" },
    { ...recipe("other-category", "Ananas"), category: "SUCRE" as const },
    { ...recipe("search-miss", "Brioche"), ingredients: [{ id: "search-miss-ingredient", label: "eau", isScalable: false }] }
  ];
  const originalToArray = db.recipes.toArray;
  db.recipes.toArray = async () => recipes;

  try {
    assert.deepEqual(
      (await dexieRecipeService.listRecipes({ category: "SALE", search: "farine" })).map(({ id }) => id),
      ["ordinary-a", "favorite-z"]
    );
    assert.deepEqual(
      (await dexieRecipeService.listRecipes({ favorite: true })).map(({ id }) => id),
      ["favorite-z"]
    );
  } finally {
    db.recipes.toArray = originalToArray;
  }
});

test("illustration de démarrage servie par l’application : chargement direct, sans BFF", () => {
  assert.equal(
    shouldProxyImageUrl("https://patrices-macbook-pro.tail3f7249.ts.net/seed/cookie-recipe.png", "https://patrices-macbook-pro.tail3f7249.ts.net"),
    false
  );
});

test("illustration distante : proxy BFF conservé", () => {
  assert.equal(shouldProxyImageUrl("https://images.example.test/cookie.png", "https://patrices-macbook-pro.tail3f7249.ts.net"), true);
});
