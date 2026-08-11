import type { ProximityIntentValid } from "./proximity-deep-link-core";
import { proximityReceiveDisplayTitle } from "./proximity-receive-display";

/** Phases UI réception : install → capacité → confirm (flows.md). */
export type ProximityReceivePhase = "idle" | "install" | "update" | "confirm";

export type ProximityReceiveSession = {
  phase: ProximityReceivePhase;
  displayTitle: string;
  /** Consentement mémoire uniquement (story 4 lit ce flag) — pas d’écriture Dexie. */
  confirmed: boolean;
};

export function createIdleProximityReceiveSession(): ProximityReceiveSession {
  return { phase: "idle", displayTitle: "", confirmed: false };
}

export function resolveProximityReceivePhase(options: {
  isStandalone: boolean;
  isCapable: boolean;
}): Exclude<ProximityReceivePhase, "idle"> {
  if (!options.isStandalone) {
    return "install";
  }
  if (!options.isCapable) {
    return "update";
  }
  return "confirm";
}

/** Ouvre la machine receive après intent valide (pas d’IndexedDB). */
export function openProximityReceiveSession(options: {
  intent: ProximityIntentValid;
  isStandalone: boolean;
  isCapable: boolean;
}): ProximityReceiveSession {
  return {
    phase: resolveProximityReceivePhase({
      isStandalone: options.isStandalone,
      isCapable: options.isCapable
    }),
    displayTitle: proximityReceiveDisplayTitle(options.intent),
    confirmed: false
  };
}

/** CTA « Continuer vers la recette » : install → update|confirm selon capacité. */
export function continueProximityReceiveFromInstall(
  session: ProximityReceiveSession,
  isCapable: boolean
): ProximityReceiveSession {
  if (session.phase !== "install") {
    return session;
  }
  return {
    ...session,
    phase: isCapable ? "confirm" : "update",
    confirmed: false
  };
}

/** Confirmer = consentement en mémoire seulement (pas Dexie / BFF / create). */
export function confirmProximityReceiveSession(
  session: ProximityReceiveSession
): ProximityReceiveSession {
  if (session.phase !== "confirm") {
    return session;
  }
  return { ...session, confirmed: true };
}

/**
 * Overlay confirm visible tant que consentement non donné.
 * Après Confirmer : `confirmed` reste true + phase `confirm` (hook story 4) ; UI masquée.
 */
export function isProximityReceiveConfirmOverlayVisible(
  session: ProximityReceiveSession
): boolean {
  return session.phase === "confirm" && !session.confirmed;
}

/** Annuler / dismiss : idle (l’appelant clear l’intent mémoire). */
export function cancelProximityReceiveSession(
  _session?: ProximityReceiveSession
): ProximityReceiveSession {
  return createIdleProximityReceiveSession();
}

export function closeProximityReceiveSession(
  _session?: ProximityReceiveSession
): ProximityReceiveSession {
  return createIdleProximityReceiveSession();
}
