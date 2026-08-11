import type { ProximityIntentValid } from "./proximity-deep-link-core";

/** Gate capacité réception proximité — `true` dans ce build (pas de force-refresh SW). */
export const PROXIMITY_RECEIVE_CAPABLE = true;

export const PROXIMITY_RECEIVE_GENERIC_TITLE = "Une recette";

export function isProximityReceiveCapable(): boolean {
  return PROXIMITY_RECEIVE_CAPABLE;
}

type StandaloneProbe = {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: Navigator | { standalone?: boolean };
};

function readNavigatorStandalone(navigator: StandaloneProbe["navigator"]): boolean {
  if (!navigator || !("standalone" in navigator)) {
    return false;
  }
  return (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Display-mode PWA installée : `standalone` (ou `navigator.standalone` iOS).
 * Hors standalone → landing install (CAP-2).
 */
export function isProximityDisplayStandalone(win?: StandaloneProbe): boolean {
  const probe = win ?? (typeof window !== "undefined" ? window : undefined);
  if (!probe) {
    return false;
  }

  if (readNavigatorStandalone(probe.navigator)) {
    return true;
  }

  try {
    return probe.matchMedia?.("(display-mode: standalone)")?.matches === true;
  } catch {
    return false;
  }
}

/** Aperçu non autoritatif Mode A : host + path de l’URL source. */
export function hostPathPreview(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.host}${path}`;
  } catch {
    return PROXIMITY_RECEIVE_GENERIC_TITLE;
  }
}

/**
 * Titre d’affichage avant Confirmer (AD-16) :
 * claim `title` si présent ; sinon host/path Mode A ; sinon label générique Mode B.
 */
export function proximityReceiveDisplayTitle(intent: ProximityIntentValid): string {
  const claimed = intent.title?.trim();
  if (claimed) {
    return claimed;
  }
  if (intent.mode === "a") {
    return hostPathPreview(intent.sourceUrl);
  }
  return PROXIMITY_RECEIVE_GENERIC_TITLE;
}
