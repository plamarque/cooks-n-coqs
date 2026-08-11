import {
  hasProximityDeepLinkParams,
  isProximityReceivePath,
  parseProximityDeepLinkSearch,
  PROXIMITY_MODE_PARAM,
  PROXIMITY_SOURCE_URL_PARAM,
  PROXIMITY_TICKET_PARAM,
  PROXIMITY_TITLE_PARAM,
  type ProximityIntentValid,
  type ProximityParseResult
} from "./proximity-deep-link-core";

let sessionIntent: ProximityParseResult | null = null;

function isValidProximityIntent(intent: ProximityParseResult | null): intent is ProximityIntentValid {
  return intent !== null && !("ok" in intent);
}

export function getProximityIntent(): ProximityParseResult | null {
  return sessionIntent;
}

export function clearProximityIntent(): void {
  sessionIntent = null;
}

export function clearProximityDeepLinkParamsFromWindowLocation(): void {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (!hasProximityDeepLinkParams(window.location.search)) {
    return;
  }

  params.delete(PROXIMITY_MODE_PARAM);
  params.delete(PROXIMITY_SOURCE_URL_PARAM);
  params.delete(PROXIMITY_TICKET_PARAM);
  params.delete(PROXIMITY_TITLE_PARAM);

  const search = params.toString();
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", nextUrl);
}

/**
 * Seam réception proximité (AD-16) : parse `/r` et retient l’intent en mémoire session.
 * N’écrit pas IndexedDB ; n’appelle pas le BFF.
 */
export function consumeProximityIntentFromWindow(basePath?: string): ProximityParseResult | null {
  if (typeof window === "undefined") {
    return null;
  }

  const resolvedBasePath = basePath ?? import.meta.env.BASE_URL;
  if (!isProximityReceivePath(window.location.pathname, resolvedBasePath)) {
    clearProximityIntent();
    return null;
  }

  if (!hasProximityDeepLinkParams(window.location.search)) {
    if (!isValidProximityIntent(sessionIntent)) {
      clearProximityIntent();
      return null;
    }
    return sessionIntent;
  }

  const result = parseProximityDeepLinkSearch(window.location.search);
  if (isValidProximityIntent(sessionIntent) && "ok" in result) {
    return sessionIntent;
  }

  sessionIntent = result;
  return result;
}
