/** Paramètres query AD-18 pour le deep link proximité `/r`. */
export const PROXIMITY_MODE_PARAM = "m";
export const PROXIMITY_SOURCE_URL_PARAM = "u";
export const PROXIMITY_TICKET_PARAM = "t";
export const PROXIMITY_TITLE_PARAM = "title";

export const PROXIMITY_RECEIVE_PATH = "/r";

export type ProximityIntentModeA = {
  mode: "a";
  sourceUrl: string;
  title?: string;
};

export type ProximityIntentModeB = {
  mode: "b";
  ticketId: string;
  title?: string;
};

export type ProximityIntentValid = ProximityIntentModeA | ProximityIntentModeB;

export type ProximityIntentInvalid = {
  ok: false;
  reason: string;
};

export type ProximityParseResult = ProximityIntentValid | ProximityIntentInvalid;

function normalizeOptionalTitle(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeHttpSourceUrl(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      // Ne pas propager d’identifiants dans un deep link partagé.
      parsed.username = "";
      parsed.password = "";
      return parsed.href;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Gate UI Mode A : URL source éligible au partage QR (http(s) normalisable). */
export function isModeAShareableSourceUrl(sourceUrl: string | null | undefined): boolean {
  return normalizeHttpSourceUrl(sourceUrl ?? null) !== undefined;
}

function invalidIntent(reason: string): ProximityIntentInvalid {
  return { ok: false, reason };
}

export function normalizeBasePath(basePath: string): string {
  const trimmed = basePath?.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function isPathUnderBase(pathname: string, basePath: string): boolean {
  const base = normalizeBasePath(basePath);
  if (base === "/") {
    return true;
  }

  const baseWithoutTrailingSlash = base.slice(0, -1);
  return pathname === baseWithoutTrailingSlash || pathname.startsWith(`${baseWithoutTrailingSlash}/`);
}

/** Pathname relatif à la base PWA (ex. `/r` sous `/repo/`). */
export function getPathRelativeToBase(pathname: string, basePath: string): string {
  const base = normalizeBasePath(basePath);
  if (base === "/") {
    return pathname || "/";
  }

  const baseWithoutTrailingSlash = base.slice(0, -1);
  if (pathname === baseWithoutTrailingSlash) {
    return "/";
  }
  if (pathname.startsWith(`${baseWithoutTrailingSlash}/`)) {
    const suffix = pathname.slice(baseWithoutTrailingSlash.length);
    return suffix.startsWith("/") ? suffix : `/${suffix}`;
  }

  return pathname || "/";
}

export function isProximityReceivePath(pathname: string, basePath: string): boolean {
  if (!isPathUnderBase(pathname, basePath)) {
    return false;
  }

  const relative = getPathRelativeToBase(pathname, basePath);
  return relative === PROXIMITY_RECEIVE_PATH || relative === `${PROXIMITY_RECEIVE_PATH}/`;
}

export function parseProximityDeepLinkSearch(search: string): ProximityParseResult {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const mode = params.get(PROXIMITY_MODE_PARAM)?.trim().toLowerCase();
  const title = normalizeOptionalTitle(params.get(PROXIMITY_TITLE_PARAM));

  if (!mode) {
    return invalidIntent("Paramètre m manquant ou vide.");
  }

  if (mode === "a") {
    const sourceUrl = normalizeHttpSourceUrl(params.get(PROXIMITY_SOURCE_URL_PARAM));
    if (!sourceUrl) {
      return invalidIntent("Mode A : paramètre u manquant ou URL non http(s).");
    }
    return title ? { mode: "a", sourceUrl, title } : { mode: "a", sourceUrl };
  }

  if (mode === "b") {
    const ticketId = params.get(PROXIMITY_TICKET_PARAM)?.trim();
    if (!ticketId) {
      return invalidIntent("Mode B : paramètre t manquant ou vide.");
    }
    return title ? { mode: "b", ticketId, title } : { mode: "b", ticketId };
  }

  return invalidIntent(`Mode de transfert inconnu : « ${mode} ».`);
}

function buildReceiveUrl(origin: string, basePath: string): URL {
  const base = normalizeBasePath(basePath);
  const baseUrl = base === "/" ? `${origin}/` : `${origin}${base}`;
  return new URL(PROXIMITY_RECEIVE_PATH.slice(1), baseUrl);
}

export function buildModeADeepLink(options: {
  origin: string;
  basePath: string;
  sourceUrl: string;
  title?: string;
}): string {
  const normalizedSource = normalizeHttpSourceUrl(options.sourceUrl);
  if (!normalizedSource) {
    throw new Error("L’URL source doit être une URL http(s) valide.");
  }

  const url = buildReceiveUrl(options.origin, options.basePath);
  url.searchParams.set(PROXIMITY_MODE_PARAM, "a");
  url.searchParams.set(PROXIMITY_SOURCE_URL_PARAM, normalizedSource);
  const title = normalizeOptionalTitle(options.title ?? null);
  if (title) {
    url.searchParams.set(PROXIMITY_TITLE_PARAM, title);
  }
  return url.href;
}

export function buildModeBDeepLink(options: {
  origin: string;
  basePath: string;
  ticketId: string;
  title?: string;
}): string {
  const ticketId = options.ticketId.trim();
  if (!ticketId) {
    throw new Error("Le ticket Mode B ne peut pas être vide.");
  }

  const url = buildReceiveUrl(options.origin, options.basePath);
  url.searchParams.set(PROXIMITY_MODE_PARAM, "b");
  url.searchParams.set(PROXIMITY_TICKET_PARAM, ticketId);
  const title = normalizeOptionalTitle(options.title ?? null);
  if (title) {
    url.searchParams.set(PROXIMITY_TITLE_PARAM, title);
  }
  return url.href;
}

export function hasProximityDeepLinkParams(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return (
    params.has(PROXIMITY_MODE_PARAM) ||
    params.has(PROXIMITY_SOURCE_URL_PARAM) ||
    params.has(PROXIMITY_TICKET_PARAM) ||
    params.has(PROXIMITY_TITLE_PARAM)
  );
}
