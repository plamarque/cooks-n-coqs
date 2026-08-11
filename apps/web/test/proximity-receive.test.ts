import assert from "node:assert/strict";
import test from "node:test";
import {
  clearProximityIntent,
  consumeProximityIntentFromWindow,
  getProximityIntent
} from "../src/services/proximity-receive-service";

const BASE_PATH = "/cookies-et-coquilettes/";
const SOURCE_URL = "https://example.com/tiramisu";

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

test("consumeProximityIntentFromWindow — Mode A valide retient intent et conserve les query params", () => {
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
    const result = consumeProximityIntentFromWindow(BASE_PATH);

    assert.deepEqual(result, {
      mode: "a",
      sourceUrl: SOURCE_URL,
      title: "Tiramisu"
    });
    assert.deepEqual(getProximityIntent(), result);
    assert.equal(currentSearch, search);
  } finally {
    restore();
  }
});

test("consumeProximityIntentFromWindow — hors /r efface la session", () => {
  let pathname = "/cookies-et-coquilettes/r";
  let search = `?m=a&u=${encodeURIComponent(SOURCE_URL)}`;
  const restore = installMockWindow({
    location: {
      get pathname() {
        return pathname;
      },
      get search() {
        return search;
      },
      hash: ""
    },
    history: { replaceState() {} }
  });

  try {
    consumeProximityIntentFromWindow(BASE_PATH);
    assert.ok(getProximityIntent());

    pathname = "/cookies-et-coquilettes/";
    search = "";
    const result = consumeProximityIntentFromWindow(BASE_PATH);

    assert.equal(result, null);
    assert.equal(getProximityIntent(), null);
  } finally {
    restore();
  }
});

test("consumeProximityIntentFromWindow — /r sans params ne crée pas d’intent invalide", () => {
  const restore = installMockWindow({
    location: {
      pathname: "/cookies-et-coquilettes/r",
      search: "",
      hash: ""
    },
    history: { replaceState() {} }
  });

  try {
    const result = consumeProximityIntentFromWindow(BASE_PATH);

    assert.equal(result, null);
    assert.equal(getProximityIntent(), null);
  } finally {
    restore();
  }
});

test("consumeProximityIntentFromWindow — /r sans params conserve un intent valide existant", () => {
  let pathname = "/cookies-et-coquilettes/r";
  let search = `?m=a&u=${encodeURIComponent(SOURCE_URL)}`;
  const restore = installMockWindow({
    location: {
      get pathname() {
        return pathname;
      },
      get search() {
        return search;
      },
      hash: ""
    },
    history: {
      replaceState(_state, _unused, url) {
        if (typeof url === "string") {
          const parsed = new URL(url, "https://example.github.io");
          pathname = parsed.pathname;
          search = parsed.search;
        }
      }
    }
  });

  try {
    const first = consumeProximityIntentFromWindow(BASE_PATH);
    assert.ok(first && !("ok" in first));

    search = "";
    const second = consumeProximityIntentFromWindow(BASE_PATH);

    assert.deepEqual(second, first);
    assert.deepEqual(getProximityIntent(), first);
  } finally {
    restore();
  }
});

test("consumeProximityIntentFromWindow — /r sans params efface un intent invalide stale", () => {
  let search = "?m=z";
  const restore = installMockWindow({
    location: {
      pathname: "/cookies-et-coquilettes/r",
      get search() {
        return search;
      },
      hash: ""
    },
    history: { replaceState() {} }
  });

  try {
    const invalid = consumeProximityIntentFromWindow(BASE_PATH);
    assert.deepEqual(invalid, {
      ok: false,
      reason: "Mode de transfert inconnu : « z »."
    });

    search = "";
    const afterBare = consumeProximityIntentFromWindow(BASE_PATH);

    assert.equal(afterBare, null);
    assert.equal(getProximityIntent(), null);
  } finally {
    restore();
  }
});

test("consumeProximityIntentFromWindow — re-parse invalide n’écrase pas un intent valide", () => {
  let search = `?m=a&u=${encodeURIComponent(SOURCE_URL)}`;
  const restore = installMockWindow({
    location: {
      pathname: "/cookies-et-coquilettes/r",
      get search() {
        return search;
      },
      hash: ""
    },
    history: { replaceState() {} }
  });

  try {
    const valid = consumeProximityIntentFromWindow(BASE_PATH);
    assert.ok(valid && !("ok" in valid));

    search = "?m=";
    const afterInvalid = consumeProximityIntentFromWindow(BASE_PATH);

    assert.deepEqual(afterInvalid, valid);
    assert.deepEqual(getProximityIntent(), valid);
  } finally {
    restore();
  }
});

test("consumeProximityIntentFromWindow — re-parse valide remplace un intent valide", () => {
  let search = `?m=a&u=${encodeURIComponent(SOURCE_URL)}&title=Tiramisu`;
  const restore = installMockWindow({
    location: {
      pathname: "/cookies-et-coquilettes/r",
      get search() {
        return search;
      },
      hash: ""
    },
    history: { replaceState() {} }
  });

  try {
    const first = consumeProximityIntentFromWindow(BASE_PATH);
    assert.deepEqual(first, {
      mode: "a",
      sourceUrl: SOURCE_URL,
      title: "Tiramisu"
    });

    search = "?m=b&t=abc&title=X";
    const second = consumeProximityIntentFromWindow(BASE_PATH);

    assert.deepEqual(second, {
      mode: "b",
      ticketId: "abc",
      title: "X"
    });
    assert.deepEqual(getProximityIntent(), second);
  } finally {
    restore();
  }
});
