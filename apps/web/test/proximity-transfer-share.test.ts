import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModeADeepLink,
  isModeAShareableSourceUrl,
  parseProximityDeepLinkSearch
} from "../src/services/proximity-deep-link-core";
import {
  closeProximityShareSession,
  createClosedProximityShareSession,
  openProximityModeAShareSession
} from "../src/services/proximity-share-session";
import { ProximityTransfer } from "../src/services/proximity-transfer-service";

const ORIGIN = "https://example.github.io";
const BASE_PATH = "/cookies-et-coquilettes/";
const SOURCE_URL = "https://example.com/tiramisu";

function installMockWindowOrigin(origin: string): () => void {
  const previousWindow = globalThis.window;
  // @ts-expect-error — mock minimal pour tests Node
  globalThis.window = { location: { origin } };
  return () => {
    if (previousWindow === undefined) {
      // @ts-expect-error — restaure l’absence de window
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  };
}

test("gate Mode A — URL https éligible", () => {
  assert.equal(isModeAShareableSourceUrl(SOURCE_URL), true);
  assert.equal(isModeAShareableSourceUrl("http://example.com/x"), true);
});

test("gate Mode A — sans URL / vide / non http(s) inéligible (pas d’overlay trompeur)", () => {
  assert.equal(isModeAShareableSourceUrl(undefined), false);
  assert.equal(isModeAShareableSourceUrl(null), false);
  assert.equal(isModeAShareableSourceUrl(""), false);
  assert.equal(isModeAShareableSourceUrl("   "), false);
  assert.equal(isModeAShareableSourceUrl("ftp://example.com/x"), false);
  assert.equal(isModeAShareableSourceUrl("not-a-url"), false);
  assert.equal(isModeAShareableSourceUrl("javascript:alert(1)"), false);
});

test("share Mode A — build deep link mockable (origin/base) comme Alice", () => {
  const link = buildModeADeepLink({
    origin: ORIGIN,
    basePath: BASE_PATH,
    sourceUrl: SOURCE_URL,
    title: "Tiramisu"
  });

  const url = new URL(link);
  assert.equal(url.origin, ORIGIN);
  assert.equal(url.pathname, "/cookies-et-coquilettes/r");
  assert.equal(url.searchParams.get("m"), "a");
  assert.equal(url.searchParams.get("u"), SOURCE_URL);
  assert.equal(url.searchParams.get("title"), "Tiramisu");
});

test("ProximityTransfer.buildModeALink — seam App avec origin mockée", () => {
  const restore = installMockWindowOrigin(ORIGIN);
  try {
    const link = ProximityTransfer.buildModeALink(SOURCE_URL, "Tiramisu");
    const url = new URL(link);
    assert.equal(url.origin, ORIGIN);
    assert.equal(url.searchParams.get("m"), "a");
    assert.equal(url.searchParams.get("u"), SOURCE_URL);
    assert.equal(url.searchParams.get("title"), "Tiramisu");
    // Sous Node/tsx, import.meta.env.BASE_URL est absent → fallback "/" (voir buildModeADeepLink pour base Pages).
    assert.equal(url.pathname, "/r");

    const parsed = parseProximityDeepLinkSearch(url.search);
    assert.deepEqual(parsed, {
      mode: "a",
      sourceUrl: SOURCE_URL,
      title: "Tiramisu"
    });
  } finally {
    restore();
  }
});

test("share Mode A — URL invalide au build : throw explicite (pas de lien QR)", () => {
  assert.throws(
    () =>
      buildModeADeepLink({
        origin: ORIGIN,
        basePath: BASE_PATH,
        sourceUrl: "ftp://example.com/x"
      }),
    /http\(s\)/
  );
});

test("share Mode A — deep link string only (pas de JSON recette) ; parse round-trip retrouve u", () => {
  const link = buildModeADeepLink({
    origin: ORIGIN,
    basePath: BASE_PATH,
    sourceUrl: SOURCE_URL,
    title: "Tiramisu"
  });
  // Contrat Alice : le payload partageable est la string deep link, jamais le JSON recette.
  assert.equal(link.includes("{"), false);
  assert.equal(link.includes("ingredients"), false);

  const parsed = parseProximityDeepLinkSearch(new URL(link).search);
  assert.deepEqual(parsed, {
    mode: "a",
    sourceUrl: SOURCE_URL,
    title: "Tiramisu"
  });
});

test("share Mode A — title omis si absent (lien minimal m + u)", () => {
  const link = buildModeADeepLink({
    origin: ORIGIN,
    basePath: "/",
    sourceUrl: SOURCE_URL
  });
  const url = new URL(link);
  assert.equal(url.searchParams.get("m"), "a");
  assert.equal(url.searchParams.get("u"), SOURCE_URL);
  assert.equal(url.searchParams.has("title"), false);
});

test("Happy Mode A — ouvrir la session share expose le deep link (overlay)", () => {
  const link = buildModeADeepLink({
    origin: ORIGIN,
    basePath: BASE_PATH,
    sourceUrl: SOURCE_URL,
    title: "Tiramisu"
  });
  const session = openProximityModeAShareSession(link, "Tiramisu");
  assert.equal(session.visible, true);
  assert.equal(session.deepLinkUrl, link);
  assert.equal(session.recipeTitle, "Tiramisu");
  assert.equal(session.deepLinkUrl.includes("{"), false);
});

test("openProximityModeAShareSession — refuse deep link vide ou whitespace", () => {
  assert.throws(() => openProximityModeAShareSession(""), /vide/);
  assert.throws(() => openProximityModeAShareSession("   "), /vide/);
});

test("Fermer — closeProximityShareSession réinitialise visible, lien et titre", () => {
  const link = buildModeADeepLink({
    origin: ORIGIN,
    basePath: BASE_PATH,
    sourceUrl: SOURCE_URL,
    title: "Tiramisu"
  });
  const open = openProximityModeAShareSession(link, "Tiramisu");
  const closed = closeProximityShareSession(open);
  assert.deepEqual(closed, createClosedProximityShareSession());
  assert.equal(closed.visible, false);
  assert.equal(closed.deepLinkUrl, "");
  assert.equal(closed.recipeTitle, undefined);
});
