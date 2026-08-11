/** État UI overlay Partager Mode A — pur, sans Dexie ni BFF. */

export type ProximityShareSession = {
  visible: boolean;
  deepLinkUrl: string;
  recipeTitle?: string;
};

export function createClosedProximityShareSession(): ProximityShareSession {
  return { visible: false, deepLinkUrl: "" };
}

/** Ouvre l’overlay après build du deep link (appelant = ProximityTransfer). */
export function openProximityModeAShareSession(
  deepLinkUrl: string,
  recipeTitle?: string
): ProximityShareSession {
  const trimmedLink = deepLinkUrl.trim();
  if (!trimmedLink) {
    throw new Error("Le deep link de partage ne peut pas être vide.");
  }

  const trimmedTitle = recipeTitle?.trim();
  return {
    visible: true,
    deepLinkUrl: trimmedLink,
    ...(trimmedTitle ? { recipeTitle: trimmedTitle } : {})
  };
}

/**
 * Fermer / dismiss mask : masque l’overlay et réinitialise lien + titre.
 * Le détail (viewMode) reste à la charge de l’appelant — aucune écriture carnet / drop.
 */
export function closeProximityShareSession(
  _session?: ProximityShareSession
): ProximityShareSession {
  return createClosedProximityShareSession();
}
