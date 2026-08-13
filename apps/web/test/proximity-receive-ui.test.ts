import assert from "node:assert/strict";
import test from "node:test";
import type { ProximityIntentValid } from "../src/services/proximity-deep-link-core";
import {
  hostPathPreview,
  isProximityDisplayStandalone,
  isProximityReceiveCapable,
  PROXIMITY_RECEIVE_CAPABLE,
  PROXIMITY_RECEIVE_GENERIC_TITLE,
  proximityReceiveDisplayTitle
} from "../src/services/proximity-receive-display";
import {
  cancelProximityReceiveSession,
  confirmProximityReceiveSession,
  continueProximityReceiveFromInstall,
  createIdleProximityReceiveSession,
  isProximityReceiveConfirmOverlayVisible,
  openProximityReceiveSession,
  resolveProximityReceivePhase
} from "../src/services/proximity-receive-session";
import {
  clearProximityIntent,
  consumeProximityIntentFromWindow,
  getProximityIntent
} from "../src/services/proximity-receive-service";

const BASE_PATH = "/cookies-et-coquilettes/";
const SOURCE_URL = "https://example.com/recipes/tiramisu";

type MockWindow = {
  location: { pathname: string; search: string; hash: string };
  history: { replaceState: (state: unknown, unused: string, url?: string | URL | null) => void };
};

function installMockWindow(mock: MockWindow): () => void {
  const previousWindow = globalThis.window;
  // @ts-expect-error — mock minimal pour tests Node
  globalThis.window = mock;
  return () => {
    if (previousWindow === undefined) {
      // @ts-expect-error — restaure l’absence de window
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  };
}

test.afterEach(() => {
  clearProximityIntent();
});

test("display title — claim title prioritaire", () => {
  const intent: ProximityIntentValid = {
    mode: "a",
    sourceUrl: SOURCE_URL,
    title: "Tiramisu"
  };
  assert.equal(proximityReceiveDisplayTitle(intent), "Tiramisu");
});

test("display title — Mode A sans title → host/path (pas BFF)", () => {
  const intent: ProximityIntentValid = { mode: "a", sourceUrl: SOURCE_URL };
  assert.equal(proximityReceiveDisplayTitle(intent), "example.com/recipes/tiramisu");
  assert.equal(hostPathPreview(SOURCE_URL), "example.com/recipes/tiramisu");
});

test("display title — Mode B sans title → label générique (pas GET drop)", () => {
  const intent: ProximityIntentValid = { mode: "b", ticketId: "ticket-1" };
  assert.equal(proximityReceiveDisplayTitle(intent), PROXIMITY_RECEIVE_GENERIC_TITLE);
  assert.equal(proximityReceiveDisplayTitle(intent), "Une recette");
});

test("standalone gate — matchMedia standalone ou navigator.standalone", () => {
  assert.equal(
    isProximityDisplayStandalone({
      matchMedia: () => ({ matches: true })
    }),
    true
  );
  assert.equal(
    isProximityDisplayStandalone({
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true }
    }),
    true
  );
  assert.equal(
    isProximityDisplayStandalone({
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: false }
    }),
    false
  );
});

test("capacité — PROXIMITY_RECEIVE_CAPABLE true dans ce build", () => {
  assert.equal(PROXIMITY_RECEIVE_CAPABLE, true);
  assert.equal(isProximityReceiveCapable(), true);
});

test("capacité — override e2e window.__e2eProximityReceiveCapable", () => {
  const restore = installMockWindow({
    location: { pathname: "/", search: "", hash: "" },
    history: { replaceState() {} }
  });
  try {
    assert.equal(isProximityReceiveCapable(), true);

    (globalThis.window as { __e2eProximityReceiveCapable?: unknown }).__e2eProximityReceiveCapable =
      false;
    assert.equal(isProximityReceiveCapable(), false);

    (globalThis.window as { __e2eProximityReceiveCapable?: unknown }).__e2eProximityReceiveCapable =
      true;
    assert.equal(isProximityReceiveCapable(), true);

    // Non-boolean ignoré → défaut productif
    (globalThis.window as { __e2eProximityReceiveCapable?: unknown }).__e2eProximityReceiveCapable =
      "false";
    assert.equal(isProximityReceiveCapable(), true);
  } finally {
    restore();
  }
});

test("phase — hors standalone → install ; capable=false → update ; sinon confirm", () => {
  assert.equal(
    resolveProximityReceivePhase({ isStandalone: false, isCapable: true }),
    "install"
  );
  assert.equal(
    resolveProximityReceivePhase({ isStandalone: true, isCapable: false }),
    "update"
  );
  assert.equal(
    resolveProximityReceivePhase({ isStandalone: true, isCapable: true }),
    "confirm"
  );
  // Install prime sur capacité absente
  assert.equal(
    resolveProximityReceivePhase({ isStandalone: false, isCapable: false }),
    "install"
  );
});

test("open session — happy confirm avec title", () => {
  const session = openProximityReceiveSession({
    intent: { mode: "a", sourceUrl: SOURCE_URL, title: "Tiramisu" },
    isStandalone: true,
    isCapable: true
  });
  assert.equal(session.phase, "confirm");
  assert.equal(session.displayTitle, "Tiramisu");
  assert.equal(session.confirmed, false);
});

test("open session — capable=false → barrière màj, pas confirm", () => {
  const session = openProximityReceiveSession({
    intent: { mode: "a", sourceUrl: SOURCE_URL, title: "Tiramisu" },
    isStandalone: true,
    isCapable: false
  });
  assert.equal(session.phase, "update");
  assert.notEqual(session.phase, "confirm");
  assert.equal(session.confirmed, false);
});

test("Continuer depuis install → confirm si capable", () => {
  const opened = openProximityReceiveSession({
    intent: { mode: "b", ticketId: "t1", title: "Soupe" },
    isStandalone: false,
    isCapable: true
  });
  assert.equal(opened.phase, "install");
  const next = continueProximityReceiveFromInstall(opened, true);
  assert.equal(next.phase, "confirm");
  assert.equal(next.displayTitle, "Soupe");
  assert.equal(next.confirmed, false);
});

test("Continuer depuis install → update si non capable", () => {
  const opened = openProximityReceiveSession({
    intent: { mode: "a", sourceUrl: SOURCE_URL },
    isStandalone: false,
    isCapable: false
  });
  const next = continueProximityReceiveFromInstall(opened, false);
  assert.equal(next.phase, "update");
});

test("Confirmer = consent mémoire only (confirmed=true, phase confirm)", () => {
  const opened = openProximityReceiveSession({
    intent: { mode: "a", sourceUrl: SOURCE_URL, title: "Tiramisu" },
    isStandalone: true,
    isCapable: true
  });
  assert.equal(isProximityReceiveConfirmOverlayVisible(opened), true);

  const confirmed = confirmProximityReceiveSession(opened);
  assert.equal(confirmed.confirmed, true);
  assert.equal(confirmed.phase, "confirm");
  // Overlay masqué après Confirmer ; phase+flag restent pour story 4.
  // App: update:visible false ne clear que si isProximityReceiveConfirmOverlayVisible.
  assert.equal(isProximityReceiveConfirmOverlayVisible(confirmed), false);
  // Pas d’appel RecipeService / BFF dans ce module — pure session.
  assert.equal(createIdleProximityReceiveSession().confirmed, false);
});

test("confirm hors phase confirm est un no-op", () => {
  const install = openProximityReceiveSession({
    intent: { mode: "a", sourceUrl: SOURCE_URL, title: "X" },
    isStandalone: false,
    isCapable: true
  });
  assert.equal(confirmProximityReceiveSession(install).confirmed, false);
});

test("Annuler = idle session ; clear intent (simulate App) sans strip URL", () => {
  const search = `?m=a&u=${encodeURIComponent(SOURCE_URL)}&title=Tiramisu`;
  let currentSearch = search;
  const restore = installMockWindow({
    location: {
      pathname: "/cookies-et-coquilettes/r",
      get search() {
        return currentSearch;
      },
      hash: ""
    },
    history: {
      replaceState(_state, _unused, url) {
        if (typeof url === "string") {
          const parsed = new URL(url, "https://example.github.io");
          currentSearch = parsed.search;
        }
      }
    }
  });

  try {
    const intent = consumeProximityIntentFromWindow(BASE_PATH);
    assert.ok(intent && !("ok" in intent));

    const session = openProximityReceiveSession({
      intent,
      isStandalone: true,
      isCapable: true
    });
    assert.equal(session.phase, "confirm");

    clearProximityIntent();
    const cancelled = cancelProximityReceiveSession(session);

    assert.equal(cancelled.phase, "idle");
    assert.equal(cancelled.confirmed, false);
    assert.equal(getProximityIntent(), null);
    assert.equal(currentSearch, search);
  } finally {
    restore();
  }
});

test("intent invalide / absent — pas d’ouverture confirm trompeuse", () => {
  assert.equal(createIdleProximityReceiveSession().phase, "idle");

  const restore = installMockWindow({
    location: {
      pathname: "/cookies-et-coquilettes/r",
      search: "?m=z",
      hash: ""
    },
    history: { replaceState() {} }
  });

  try {
    const result = consumeProximityIntentFromWindow(BASE_PATH);
    assert.ok(result && "ok" in result && result.ok === false);
    // App ne doit ouvrir que si intent valide — session idle.
    assert.equal(createIdleProximityReceiveSession().phase, "idle");
  } finally {
    restore();
  }
});

test("landing install conserve les query /r après consume", () => {
  const search = `?m=a&u=${encodeURIComponent(SOURCE_URL)}&title=Tiramisu`;
  let currentSearch = search;
  const restore = installMockWindow({
    location: {
      pathname: "/cookies-et-coquilettes/r",
      get search() {
        return currentSearch;
      },
      hash: ""
    },
    history: {
      replaceState(_state, _unused, url) {
        if (typeof url === "string") {
          const parsed = new URL(url, "https://example.github.io");
          currentSearch = parsed.search;
        }
      }
    }
  });

  try {
    const intent = consumeProximityIntentFromWindow(BASE_PATH);
    assert.ok(intent && !("ok" in intent));
    const session = openProximityReceiveSession({
      intent,
      isStandalone: false,
      isCapable: true
    });
    assert.equal(session.phase, "install");
    assert.equal(currentSearch, search);
  } finally {
    restore();
  }
});
