import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModeADeepLink,
  buildModeBDeepLink,
  getPathRelativeToBase,
  isProximityReceivePath,
  parseProximityDeepLinkSearch,
  PROXIMITY_RECEIVE_PATH
} from "../src/services/proximity-deep-link-core";

const ORIGIN = "https://example.github.io";
const BASE_PATH = "/cookies-et-coquilettes/";
const SOURCE_URL = "https://example.com/tiramisu";

test("Mode A valide — intent avec sourceUrl et title optionnel", () => {
  const search = `?m=a&u=${encodeURIComponent(SOURCE_URL)}&title=Tiramisu`;
  const result = parseProximityDeepLinkSearch(search);

  assert.equal("ok" in result, false);
  assert.deepEqual(result, {
    mode: "a",
    sourceUrl: SOURCE_URL,
    title: "Tiramisu"
  });
});

test("Mode B valide — intent avec ticketId et title optionnel", () => {
  const result = parseProximityDeepLinkSearch("?m=b&t=abc&title=X");

  assert.equal("ok" in result, false);
  assert.deepEqual(result, {
    mode: "b",
    ticketId: "abc",
    title: "X"
  });
});

test("m inconnu — intent invalide explicite", () => {
  const result = parseProximityDeepLinkSearch("?m=x");

  assert.deepEqual(result, {
    ok: false,
    reason: "Mode de transfert inconnu : « x »."
  });
});

test("m manquant — intent invalide explicite", () => {
  const result = parseProximityDeepLinkSearch("");

  assert.deepEqual(result, {
    ok: false,
    reason: "Paramètre m manquant ou vide."
  });
});

test("Mode A sans u — intent invalide", () => {
  const result = parseProximityDeepLinkSearch("?m=a");

  assert.deepEqual(result, {
    ok: false,
    reason: "Mode A : paramètre u manquant ou URL non http(s)."
  });
});

test("Mode A avec u non-http(s) — intent invalide", () => {
  const result = parseProximityDeepLinkSearch(`?m=a&u=${encodeURIComponent("ftp://example.com/x")}`);

  assert.deepEqual(result, {
    ok: false,
    reason: "Mode A : paramètre u manquant ou URL non http(s)."
  });
});

test("Mode A — strip userinfo des credentials dans u", () => {
  const result = parseProximityDeepLinkSearch(
    `?m=a&u=${encodeURIComponent("https://user:secret@example.com/tiramisu")}`
  );

  assert.equal("ok" in result, false);
  assert.deepEqual(result, {
    mode: "a",
    sourceUrl: "https://example.com/tiramisu"
  });
});

test("buildModeADeepLink — strip userinfo avant encodage", () => {
  const href = buildModeADeepLink({
    origin: ORIGIN,
    basePath: BASE_PATH,
    sourceUrl: "https://user:secret@example.com/tiramisu"
  });

  const url = new URL(href);
  assert.equal(url.searchParams.get("u"), "https://example.com/tiramisu");
  assert.equal(url.href.includes("secret"), false);
});

test("Mode B sans t — intent invalide", () => {
  const result = parseProximityDeepLinkSearch("?m=b");

  assert.deepEqual(result, {
    ok: false,
    reason: "Mode B : paramètre t manquant ou vide."
  });
});

test("isProximityReceivePath — détecte /r sous BASE_URL GitHub Pages", () => {
  assert.equal(isProximityReceivePath("/cookies-et-coquilettes/r", BASE_PATH), true);
  assert.equal(isProximityReceivePath("/cookies-et-coquilettes/r/", BASE_PATH), true);
});

test("isProximityReceivePath — racine et share-target inchangés", () => {
  assert.equal(isProximityReceivePath("/", "/"), false);
  assert.equal(isProximityReceivePath("/cookies-et-coquilettes/", BASE_PATH), false);
  assert.equal(isProximityReceivePath("/cookies-et-coquilettes", BASE_PATH), false);
  assert.equal(isProximityReceivePath("/r", "/"), true);
  assert.equal(isProximityReceivePath("/r", BASE_PATH), false);
});

test("getPathRelativeToBase — normalise le pathname sous base", () => {
  assert.equal(getPathRelativeToBase("/cookies-et-coquilettes/r", BASE_PATH), PROXIMITY_RECEIVE_PATH);
  assert.equal(getPathRelativeToBase("/r", "/"), PROXIMITY_RECEIVE_PATH);
});

test("buildModeADeepLink — golden link Mode A avec origine PWA", () => {
  const href = buildModeADeepLink({
    origin: ORIGIN,
    basePath: BASE_PATH,
    sourceUrl: SOURCE_URL,
    title: "Tiramisu"
  });

  const url = new URL(href);
  assert.equal(url.origin, ORIGIN);
  assert.equal(url.pathname, "/cookies-et-coquilettes/r");
  assert.equal(url.searchParams.get("m"), "a");
  assert.equal(url.searchParams.get("u"), SOURCE_URL);
  assert.equal(url.searchParams.get("title"), "Tiramisu");
});

test("buildModeBDeepLink — lien Mode B avec ticket opaque", () => {
  const href = buildModeBDeepLink({
    origin: ORIGIN,
    basePath: BASE_PATH,
    ticketId: "abc",
    title: "X"
  });

  const url = new URL(href);
  assert.equal(url.pathname, "/cookies-et-coquilettes/r");
  assert.equal(url.searchParams.get("m"), "b");
  assert.equal(url.searchParams.get("t"), "abc");
  assert.equal(url.searchParams.get("title"), "X");
});

test("buildModeADeepLink — title omis si absent", () => {
  const href = buildModeADeepLink({
    origin: ORIGIN,
    basePath: "/",
    sourceUrl: SOURCE_URL
  });

  const url = new URL(href);
  assert.equal(url.pathname, "/r");
  assert.equal(url.searchParams.has("title"), false);
});

test("parse puis build Mode A — round-trip cohérent", () => {
  const built = buildModeADeepLink({
    origin: ORIGIN,
    basePath: BASE_PATH,
    sourceUrl: SOURCE_URL,
    title: "Tiramisu"
  });
  const parsed = parseProximityDeepLinkSearch(new URL(built).search);

  assert.deepEqual(parsed, {
    mode: "a",
    sourceUrl: SOURCE_URL,
    title: "Tiramisu"
  });
});

test("parse puis build Mode B — round-trip cohérent", () => {
  const built = buildModeBDeepLink({
    origin: ORIGIN,
    basePath: BASE_PATH,
    ticketId: "abc",
    title: "X"
  });
  const parsed = parseProximityDeepLinkSearch(new URL(built).search);

  assert.deepEqual(parsed, {
    mode: "b",
    ticketId: "abc",
    title: "X"
  });
});
