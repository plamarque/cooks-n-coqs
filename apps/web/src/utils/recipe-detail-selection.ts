import type { Recipe } from "@cookies-et-coquilettes/domain";

/** Champs portions nécessaires à la résolution CAP-1 (affichage détail / partage). */
export type ServingsDisplaySource = {
  servingsCurrent?: number | null;
  servingsBase?: number | null;
};

/**
 * CAP-1 : portions affichables — `servingsCurrent` s’il est fini et > 0,
 * sinon `servingsBase` sous la même règle ; sinon undefined.
 */
export function resolveDisplayedServings(
  recipe: ServingsDisplaySource
): number | undefined {
  const current = recipe.servingsCurrent;
  if (
    current !== undefined &&
    current !== null &&
    Number.isFinite(current) &&
    current > 0
  ) {
    return current;
  }
  const base = recipe.servingsBase;
  if (
    base !== undefined &&
    base !== null &&
    Number.isFinite(base) &&
    base > 0
  ) {
    return base;
  }
  return undefined;
}

/** Chaîne pour le champ Portions du détail (vide si aucune portion CAP-1). */
export function servingsInputFromRecipe(recipe: ServingsDisplaySource): string {
  const n = resolveDisplayedServings(recipe);
  return n !== undefined ? String(n) : "";
}

/** Durée d’affichage du badge de succès post-sauvegarde (ms). */
export const SAVE_SUCCESS_BADGE_MS = 2500;

/** CAP-2 : le badge ne capture pas les pointeurs — la fiche reste utilisable. */
export const SAVE_SUCCESS_BADGE_POINTER_EVENTS = "none" as const;

export type PostSaveNavigation = {
  goToDetail: boolean;
  showSuccessBadge: boolean;
  stayOnForm: boolean;
};

/** Libellés contractuels post-sauvegarde (édition vs création). */
export function recipeSaveSuccessLabel(isEdit: boolean): string {
  return isEdit ? "Recette modifiée." : "Recette créée.";
}

/** Navigation après sauvegarde réussie : DETAIL + badge, pas le formulaire. */
export function postSaveNavigationOnSuccess(): PostSaveNavigation {
  return { goToDetail: true, showSuccessBadge: true, stayOnForm: false };
}

/** Navigation après échec de sauvegarde : rester sur le formulaire, pas de badge. */
export function postSaveNavigationOnFailure(): PostSaveNavigation {
  return { goToDetail: false, showSuccessBadge: false, stayOnForm: true };
}

/**
 * Résout la fiche affichée en DETAIL : override post-sauvegarde d’abord
 * (évite une fiche périmée si `refresh` échoue alors que la liste stale
 * contient encore l’id), sinon entrée de la liste filtrée.
 */
export function resolveDetailRecipe(
  recipes: readonly Recipe[],
  selectedId: string | null,
  override: Recipe | null
): Recipe | null {
  if (!selectedId) {
    return null;
  }
  if (override?.id === selectedId) {
    return override;
  }
  return recipes.find((recipe) => recipe.id === selectedId) ?? null;
}

export type SelectionAfterRefresh = {
  selectedId: string | null;
  clearToList: boolean;
  clearOverride: boolean;
};

/**
 * Décide si `refresh()` doit annuler la sélection quand l’id n’est plus dans
 * la liste filtrée. `allowOutsideFilterId` conserve DETAIL hors filtres.
 */
export function selectionAfterFilteredRefresh(
  selectedId: string | null,
  filteredRecipes: readonly Recipe[],
  allowOutsideFilterId: string | null = null
): SelectionAfterRefresh {
  if (!selectedId) {
    return { selectedId: null, clearToList: false, clearOverride: false };
  }
  if (filteredRecipes.some((recipe) => recipe.id === selectedId)) {
    return { selectedId, clearToList: false, clearOverride: true };
  }
  if (allowOutsideFilterId === selectedId) {
    return { selectedId, clearToList: false, clearOverride: false };
  }
  return { selectedId: null, clearToList: true, clearOverride: true };
}
