import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  normalizeUrlForDedup,
  computeImportSourceStableKey,
  resolveImportSourceStableKey
} from "../src/import-source-dedup.js";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

test("normalizeUrlForDedup strips utm and lowercases host", () => {
  const a = normalizeUrlForDedup("HTTPS://Example.COM/path/?utm_source=x&p=1");
  const b = normalizeUrlForDedup("https://example.com/path?p=1");
  assert.equal(a, b);
});

test("normalizeUrlForDedup sorts query keys", () => {
  const a = normalizeUrlForDedup("https://ex.com/x?b=2&a=1");
  const b = normalizeUrlForDedup("https://ex.com/x?a=1&b=2");
  assert.equal(a, b);
});

test("computeImportSourceStableKey: equivalent URLs same hash", async () => {
  const k1 = await computeImportSourceStableKey({
    type: "URL",
    url: "https://youtu.be/AbC?utm_medium=email",
    capturedAt: "t"
  });
  const k2 = await computeImportSourceStableKey({
    type: "URL",
    url: "https://youtu.be/AbC",
    capturedAt: "t"
  });
  assert.equal(k1, k2);
  assert.match(k1, /^[a-f0-9]{64}$/);
});

test("computeImportSourceStableKey: no url returns undefined", async () => {
  const k = await computeImportSourceStableKey({ type: "MANUAL", capturedAt: "t" });
  assert.equal(k, undefined);
});

test("resolveImportSourceStableKey prefers stored key", async () => {
  const k = await resolveImportSourceStableKey({
    importSourceStableKey: "stored-key",
    source: { type: "URL", url: "https://example.com/a", capturedAt: "t" }
  });
  assert.equal(k, "stored-key");
});

test("computeImportSourceStableKey matches when subtle is disabled (repli JS)", async () => {
  const src = { type: "URL", url: "https://example.com/dedup-fallback?utm=1", capturedAt: "t" };
  const withSubtle = await computeImportSourceStableKey(src);
  const subtle = globalThis.crypto.subtle;
  Object.defineProperty(globalThis.crypto, "subtle", {
    value: undefined,
    configurable: true
  });
  try {
    const withoutSubtle = await computeImportSourceStableKey(src);
    assert.equal(withoutSubtle, withSubtle);
  } finally {
    Object.defineProperty(globalThis.crypto, "subtle", {
      value: subtle,
      configurable: true
    });
  }
});
