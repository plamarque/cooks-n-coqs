import assert from "node:assert/strict";
import test from "node:test";
import { buildModeADeepLink } from "../src/services/proximity-deep-link-core";
import {
  QR_LEVEL_M_BYTE_CAPACITY,
  QR_PAYLOAD_TOO_LARGE_MESSAGE,
  PROXIMITY_MODE_B_TICKET_ID_LENGTH,
  assertQrPayloadFitsLevelM,
  qrPayloadFitsLevelM,
  utf8ByteLength
} from "../src/utils/qr-payload-capacity";

test("PROXIMITY_MODE_B_TICKET_ID_LENGTH aligne le pré-contrôle sur le ticket BFF (24 chars base64url)", () => {
  assert.equal(PROXIMITY_MODE_B_TICKET_ID_LENGTH, 24);
});

test("utf8ByteLength compte les octets UTF-8, pas les code units", () => {
  assert.equal(utf8ByteLength("a"), 1);
  assert.equal(utf8ByteLength("é"), 2);
  assert.equal(utf8ByteLength("日本語"), 9);
});

test("qrPayloadFitsLevelM accepte exactement 2331 octets UTF-8", () => {
  const payload = "a".repeat(QR_LEVEL_M_BYTE_CAPACITY);
  assert.equal(utf8ByteLength(payload), 2331);
  assert.equal(qrPayloadFitsLevelM(payload), true);
  assert.doesNotThrow(() => assertQrPayloadFitsLevelM(payload));
});

test("qrPayloadFitsLevelM refuse 2332 octets UTF-8", () => {
  const payload = "a".repeat(QR_LEVEL_M_BYTE_CAPACITY + 1);
  assert.equal(utf8ByteLength(payload), 2332);
  assert.equal(qrPayloadFitsLevelM(payload), false);
  assert.throws(
    () => assertQrPayloadFitsLevelM(payload),
    (error: unknown) =>
      error instanceof Error && error.message === QR_PAYLOAD_TOO_LARGE_MESSAGE
  );
});

test("seuil respecté avec caractères multi-octets (titre pathologique)", () => {
  // 778 × « 日 » = 2334 octets (> 2331) ; 777 × « 日 » = 2331 octets exact.
  const under = "日".repeat(777);
  const over = "日".repeat(778);
  assert.equal(utf8ByteLength(under), 2331);
  assert.equal(utf8ByteLength(over), 2334);
  assert.equal(qrPayloadFitsLevelM(under), true);
  assert.equal(qrPayloadFitsLevelM(over), false);
  assert.doesNotThrow(() => assertQrPayloadFitsLevelM(under));
  assert.throws(() => assertQrPayloadFitsLevelM(over));
});

test("deep link Mode A réaliste court tient dans capacité QR level M", () => {
  const link = buildModeADeepLink({
    origin: "https://example.github.io",
    basePath: "/cookies-et-coquilettes/",
    sourceUrl: "https://example.com/tiramisu",
    title: "Tiramisu"
  });
  assert.ok(utf8ByteLength(link) < QR_LEVEL_M_BYTE_CAPACITY);
  assert.equal(qrPayloadFitsLevelM(link), true);
  assert.doesNotThrow(() => assertQrPayloadFitsLevelM(link));
});

test("deep link Mode A pathologique (URL + title) dépasse capacité QR level M", () => {
  const sourceUrl = `https://example.com/${"a".repeat(2200)}`;
  const title = "日".repeat(200);
  const link = buildModeADeepLink({
    origin: "https://example.github.io",
    basePath: "/cookies-et-coquilettes/",
    sourceUrl,
    title
  });
  assert.ok(utf8ByteLength(link) > QR_LEVEL_M_BYTE_CAPACITY);
  assert.equal(qrPayloadFitsLevelM(link), false);
  assert.throws(
    () => assertQrPayloadFitsLevelM(link),
    (error: unknown) =>
      error instanceof Error && error.message === QR_PAYLOAD_TOO_LARGE_MESSAGE
  );
});
