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
  resolveDisplayedServings,
  selectionAfterFilteredRefresh,
  servingsInputFromRecipe
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

test("Assistant : candidate Cahier en lecture seule et refus local", () => {
  const appPath = join(dirname(fileURLToPath(import.meta.url)), "../src/App.vue");
  const app = readFileSync(appPath, "utf8");
  const openCandidate = app.match(/function openAssistantCandidate\([\s\S]*?\n\}/);
  assert.ok(openCandidate);
  assert.doesNotMatch(openCandidate[0], /updateRecipe|storeImage|generateRecipeImage/);
  const rejectCandidate = app.match(/function rejectAssistantCandidate\([\s\S]*?\n\}/);
  assert.ok(rejectCandidate);
  assert.match(rejectCandidate[0], /assistantSession\.rejectCandidate\(candidate\.id\)/);
  assert.doesNotMatch(rejectCandidate[0], /updateRecipe|storeImage|generateAssistantRecipe/);
  assert.match(app, /!assistantSession\.isCandidateRejected\(recipe\.id\)/);
  const prepareRequest = app.match(/async function prepareAssistantRequest\([\s\S]*?\n\}/);
  assert.ok(prepareRequest);
  assert.match(prepareRequest[0], /assistantCandidatePreviews\.value = \[\];/);
  const savePreview = app.match(/async function saveAssistantPreview\([\s\S]*?\n\}/);
  assert.ok(savePreview);
  assert.match(savePreview[0], /await persistAssistantPreview/);
  assert.doesNotMatch(savePreview[0], /hydrateStepMediaFromDraft/);
  assert.doesNotMatch(savePreview[0], /db\.images\.delete/);
  assert.match(savePreview[0], /detailRecipeOverride\.value = saved\.recipe/);
  assert.match(app, /Refuser \$\{candidate\.title\}/);
  assert.match(app, /assistant-composer--with-candidates/);
});

test("Assistant : la preview est éditable en mémoire avant Sauvegarder", () => {
  const appPath = join(dirname(fileURLToPath(import.meta.url)), "../src/App.vue");
  const app = readFileSync(appPath, "utf8");
  const previewSection = app.match(/viewMode === 'ASSISTANT_PREVIEW'[\s\S]*?<\/section>/);
  assert.ok(previewSection);
  assert.match(previewSection[0], /v-model="assistantPreview\.draft\.title"/);
  assert.match(previewSection[0], /v-model="ingredient\.label"/);
  assert.match(previewSection[0], /v-model="step\.text"/);
  assert.match(previewSection[0], /addAssistantPreviewStepMedium/);
  assert.match(previewSection[0], /:disabled="assistantPreviewSaving"/);
  assert.match(previewSection[0], /<fieldset class="assistant-preview-editor" :disabled="assistantPreviewSaving">/);
  const closePreview = app.match(/async function closeAssistantPreview\([\s\S]*?\n\}/);
  assert.ok(closePreview);
  assert.match(closePreview[0], /if \(assistantPreviewSaving\.value\) return/);
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

// Matrice CAP-1 : current exploitable
test("CAP-1 : servingsCurrent exploitable → champ = current", () => {
  const src = { servingsCurrent: 4, servingsBase: 6 };
  assert.equal(resolveDisplayedServings(src), 4);
  assert.equal(servingsInputFromRecipe(src), "4");
});

// Matrice CAP-1 : current absent, base OK
test("CAP-1 : current absent, base OK → champ = base", () => {
  const src = { servingsBase: 6 };
  assert.equal(resolveDisplayedServings(src), 6);
  assert.equal(servingsInputFromRecipe(src), "6");
});

// Matrice CAP-1 : current invalide (≤0 / non fini) → fallback base
test("CAP-1 : current invalide, base OK → champ = base", () => {
  assert.equal(resolveDisplayedServings({ servingsCurrent: 0, servingsBase: 6 }), 6);
  assert.equal(resolveDisplayedServings({ servingsCurrent: -1, servingsBase: 6 }), 6);
  assert.equal(resolveDisplayedServings({ servingsCurrent: NaN, servingsBase: 6 }), 6);
  assert.equal(resolveDisplayedServings({ servingsCurrent: Infinity, servingsBase: 6 }), 6);
  assert.equal(servingsInputFromRecipe({ servingsCurrent: 0, servingsBase: 6 }), "6");
});

// Matrice CAP-1 : aucune portion valide
test("CAP-1 : aucune portion valide → champ vide", () => {
  assert.equal(resolveDisplayedServings({}), undefined);
  assert.equal(resolveDisplayedServings({ servingsCurrent: 0, servingsBase: 0 }), undefined);
  assert.equal(resolveDisplayedServings({ servingsCurrent: NaN, servingsBase: -2 }), undefined);
  assert.equal(servingsInputFromRecipe({}), "");
  assert.equal(servingsInputFromRecipe({ servingsCurrent: undefined, servingsBase: null }), "");
});

// Matrice : toutes les entrées DETAIL peuplent via CAP-1 ; peupler ≠ scaler
test("App.vue : entrées DETAIL peuplent servingsInput via CAP-1 sans scaleRecipe", () => {
  const appPath = join(dirname(fileURLToPath(import.meta.url)), "../src/App.vue");
  const app = readFileSync(appPath, "utf8");
  assert.match(app, /servingsInputFromRecipe/);
  // openDetail, saveForm (goToDetail), createRecipeFromDraft (branche DETAIL)
  const openDetail = app.match(/function openDetail\([\s\S]*?\n\}/);
  assert.ok(openDetail);
  assert.match(openDetail[0], /servingsInput\.value = servingsInputFromRecipe\(recipe\)/);
  assert.doesNotMatch(openDetail[0], /scaleRecipe/);

  const saveForm = app.match(/async function saveForm\(\)[\s\S]*?\n\}/);
  assert.ok(saveForm);
  assert.match(
    saveForm[0],
    /servingsInput\.value = servingsInputFromRecipe\(savedRecipe \?\? \{\}\)/
  );
  assert.doesNotMatch(saveForm[0], /scaleRecipe/);

  const createFromDraft = app.match(/async function createRecipeFromDraft\([\s\S]*?\n\}/);
  assert.ok(createFromDraft);
  const fallbackFormBranch = createFromDraft[0].match(
    /if \(isMinimalFallbackDraft\(draft\)\) \{[\s\S]*?\n  \} else \{/
  );
  assert.ok(fallbackFormBranch, "branche fallback FORM attendue");
  assert.doesNotMatch(fallbackFormBranch[0], /servingsInputFromRecipe/);
  const detailBranch = createFromDraft[0].match(
    /\} else \{\n    servingsInput\.value = servingsInputFromRecipe\(recipe\);\n    viewMode\.value = "DETAIL";/
  );
  assert.ok(detailBranch, "peuplement CAP-1 uniquement sur branche DETAIL");
  assert.doesNotMatch(createFromDraft[0], /scaleRecipe/);
});
