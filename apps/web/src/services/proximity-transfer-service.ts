import {
  buildModeADeepLink,
  buildModeBDeepLink
} from "./proximity-deep-link-core";

function resolvePwaOrigin(): string {
  if (typeof window === "undefined") {
    throw new Error("ProximityTransfer nécessite un contexte navigateur (origin PWA).");
  }
  return window.location.origin;
}

function resolveBasePath(): string {
  // Vite peut exposer BASE_URL="" ; `||` couvre nullish et chaîne vide.
  return import.meta.env?.BASE_URL || "/";
}

/** Seam partage proximité (AD-14) : construction de liens deep link PWA, sans Dexie ni BFF. */
export const ProximityTransfer = {
  buildModeALink(sourceUrl: string, title?: string): string {
    return buildModeADeepLink({
      origin: resolvePwaOrigin(),
      basePath: resolveBasePath(),
      sourceUrl,
      title
    });
  },

  buildModeBLink(ticketId: string, title?: string): string {
    return buildModeBDeepLink({
      origin: resolvePwaOrigin(),
      basePath: resolveBasePath(),
      ticketId,
      title
    });
  }
};
