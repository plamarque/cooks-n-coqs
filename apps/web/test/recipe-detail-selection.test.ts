import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@cookies-et-coquilettes/domain";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SAVE_SUCCESS_BADGE_POINTER_EVENTS,
  postSaveNavigationOnFailure,
  postSaveNavigationOnSuccess,
  recipeSaveSuccessLabel,
  resolveDetailRecipe,
  selectionAfterFilteredRefresh
} from "../src/utils/recipe-detail-selection";

function recipe(partial: Partial<Recipe> & Pick<Recipe, "id" | "title">): Recipe {
  return {
    category: "SALE",
    favorite: false,
    ingredients: [],
    steps: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial
  };
}

// Matrice : édition OK visible dans filtres → DETAIL + libellé modifié
test("édition réussie dans filtres : détail via liste + label Recette modifiée.", () => {
  const listed = recipe({ id: "a", title: "Liste" });
  assert.equal(resolveDetailRecipe([listed], "a", null), listed);
  assert.deepEqual(selectionAfterFilteredRefresh("a", [listed], "a"), {
    selectedId: "a",
    clearToList: false,
    clearOverride: true
  });
  assert.equal(recipeSaveSuccessLabel(true), "Recette modifiée.");
  assert.deepEqual(postSaveNavigationOnSuccess(), {
    goToDetail: true,
    showSuccessBadge: true,
    stayOnForm: false
  });
});

// Matrice : édition OK hors filtres (Favoris)
test("édition réussie hors filtres : override DETAIL + label Recette modifiée.", () => {
  const override = recipe({ id: "saved", title: "Hors filtres" });
  const other = recipe({ id: "fav", title: "Favorite" });
  assert.equal(resolveDetailRecipe([other], "saved", override), override);
  assert.deepEqual(selectionAfterFilteredRefresh("saved", [other], "saved"), {
    selectedId: "saved",
    clearToList: false,
    clearOverride: false
  });
  assert.equal(recipeSaveSuccessLabel(true), "Recette modifiée.");
});

// Matrice : création OK
test("création réussie : navigation DETAIL + label Recette créée.", () => {
  const created = recipe({ id: "new", title: "Nouvelle" });
  assert.equal(resolveDetailRecipe([], "new", created), created);
  assert.equal(recipeSaveSuccessLabel(false), "Recette créée.");
  assert.deepEqual(postSaveNavigationOnSuccess(), {
    goToDetail: true,
    showSuccessBadge: true,
    stayOnForm: false
  });
});

// Matrice : recherche/catégorie exclut l’id
test("sauvegarde OK hors recherche/catégorie : override conserve DETAIL", () => {
  const override = recipe({ id: "saved", title: "Exclue" });
  const other = recipe({ id: "other", title: "Autre" });
  assert.equal(resolveDetailRecipe([other], "saved", override), override);
  assert.deepEqual(selectionAfterFilteredRefresh("saved", [other], "saved"), {
    selectedId: "saved",
    clearToList: false,
    clearOverride: false
  });
});

// Matrice : échec save → rester formulaire
test("échec sauvegarde : rester formulaire, pas de DETAIL ni badge", () => {
  assert.deepEqual(postSaveNavigationOnFailure(), {
    goToDetail: false,
    showSuccessBadge: false,
    stayOnForm: true
  });
});

// Matrice : pendant badge, fiche utilisable (non bloquant)
test("badge succès : pointer-events none (fiche utilisable)", () => {
  assert.equal(SAVE_SUCCESS_BADGE_POINTER_EVENTS, "none");
  const cssPath = join(dirname(fileURLToPath(import.meta.url)), "../src/styles.css");
  const css = readFileSync(cssPath, "utf8");
  assert.match(css, /\.save-success-badge\s*\{[^}]*pointer-events:\s*none/s);
});

test("resolveDetailRecipe returns null without selected id", () => {
  assert.equal(resolveDetailRecipe([recipe({ id: "a", title: "A" })], null, null), null);
});

test("resolveDetailRecipe prefers override over stale list entry", () => {
  const listed = recipe({ id: "a", title: "Liste périmée" });
  const override = recipe({ id: "a", title: "Sauvegardée" });
  assert.equal(resolveDetailRecipe([listed], "a", override), override);
});

test("resolveDetailRecipe uses list when override cleared", () => {
  const listed = recipe({ id: "a", title: "Liste" });
  assert.equal(resolveDetailRecipe([listed], "a", null), listed);
});

test("resolveDetailRecipe ignores override with mismatched id", () => {
  const override = recipe({ id: "other", title: "Autre" });
  assert.equal(resolveDetailRecipe([], "saved", override), null);
});

test("selectionAfterFilteredRefresh clears when absent and no allowOutsideFilterId", () => {
  assert.deepEqual(selectionAfterFilteredRefresh("missing", [], null), {
    selectedId: null,
    clearToList: true,
    clearOverride: true
  });
});

test("selectionAfterFilteredRefresh does not preserve mismatched allowOutsideFilterId", () => {
  assert.deepEqual(selectionAfterFilteredRefresh("saved", [], "other"), {
    selectedId: null,
    clearToList: true,
    clearOverride: true
  });
});
