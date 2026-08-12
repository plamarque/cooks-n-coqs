import assert from "node:assert/strict";
import test from "node:test";
import {
  PROXIMITY_DROP_TTL_MS,
  ProximityDropStore,
  validateProximityDropBody
} from "../src/proximity-drop-store.js";

const samplePayload = {
  title: "Tiramisu",
  category: "SUCRE",
  ingredients: [],
  steps: []
};

test("create + consume retourne le payload une fois (happy path)", () => {
  const store = new ProximityDropStore();
  const before = Date.now();
  const { id, expiresAt } = store.create(samplePayload);

  assert.match(id, /^[A-Za-z0-9_-]+$/);
  assert.ok(id.length >= 16);

  const expiresMs = Date.parse(expiresAt);
  assert.ok(Number.isFinite(expiresMs));
  assert.ok(expiresMs >= before + PROXIMITY_DROP_TTL_MS - 1000);
  assert.ok(expiresMs <= before + PROXIMITY_DROP_TTL_MS + 1000);

  const first = store.consume(id);
  assert.equal(first.ok, true);
  if (first.ok) {
    assert.deepEqual(first.payload, samplePayload);
  }
});

test("create isole le payload (structuredClone)", () => {
  const store = new ProximityDropStore();
  const mutable = {
    title: "Tiramisu",
    category: "SUCRE",
    ingredients: [{ label: "Mascarpone" }],
    steps: []
  };
  const { id } = store.create(mutable);
  mutable.title = "MUTATED";
  mutable.ingredients[0]!.label = "MUTATED";

  const result = store.consume(id);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.title, "Tiramisu");
    assert.deepEqual(result.payload.ingredients, [{ label: "Mascarpone" }]);
  }
});

test("consume retourne une copie isolée du payload", () => {
  const store = new ProximityDropStore();
  const { id } = store.create({
    title: "Tiramisu",
    ingredients: [{ label: "Mascarpone" }]
  });
  const result = store.consume(id);
  assert.equal(result.ok, true);
  if (result.ok) {
    (result.payload.ingredients as { label: string }[])[0]!.label = "MUTATED";
    assert.deepEqual(result.payload.ingredients, [{ label: "MUTATED" }]);
    // Pas de fuite vers une entrée store (déjà tombstonée) — copie indépendante.
    assert.equal(typeof result.payload.title, "string");
  }
});

test("second consume après burn → consumed sans payload", () => {
  const store = new ProximityDropStore();
  const { id } = store.create(samplePayload);

  assert.equal(store.consume(id).ok, true);
  const second = store.consume(id);
  assert.deepEqual(second, { ok: false, error: "consumed" });
});

test("TTL forcé : now === expiresAtMs → expired (seuil >=)", () => {
  let nowMs = 1_000_000;
  const store = new ProximityDropStore({
    now: () => nowMs,
    ttlMs: 60_000
  });
  const { id, expiresAt } = store.create(samplePayload);
  assert.equal(expiresAt, new Date(nowMs + 60_000).toISOString());

  nowMs = nowMs + 60_000;
  const expired = store.consume(id);
  assert.deepEqual(expired, { ok: false, error: "expired" });

  // Après nettoyage, l’id est inconnu (pas consumed).
  assert.deepEqual(store.consume(id), { ok: false, error: "not_found" });
});

test("sweep retire tombstones consumed et entrées expirées", () => {
  let nowMs = 1_000_000;
  const store = new ProximityDropStore({
    now: () => nowMs,
    ttlMs: 60_000
  });

  const a = store.create({ title: "A" });
  assert.equal(store.consume(a.id).ok, true);
  assert.equal(store.size, 1); // tombstone A

  // create déclenche un sweep → tombstone A retiré
  const b = store.create({ title: "B" });
  assert.equal(store.size, 1);
  assert.deepEqual(store.consume(a.id), { ok: false, error: "not_found" });

  // expire B via create (sweep) après avancement d’horloge
  nowMs = nowMs + 60_000;
  const c = store.create({ title: "C" });
  assert.equal(store.size, 1); // B expiré retiré, seul C reste
  assert.deepEqual(store.consume(b.id), { ok: false, error: "not_found" });
  assert.equal(store.consume(c.id).ok, true);
});

test("id inconnu → not_found", () => {
  const store = new ProximityDropStore();
  assert.deepEqual(store.consume("inexistant-ticket-id"), {
    ok: false,
    error: "not_found"
  });
});

test("validateProximityDropBody refuse non-objet / title vide et trim le title", () => {
  assert.equal(validateProximityDropBody(null).ok, false);
  assert.equal(validateProximityDropBody("x").ok, false);
  assert.equal(validateProximityDropBody([]).ok, false);
  assert.equal(validateProximityDropBody({}).ok, false);
  assert.equal(validateProximityDropBody({ title: "" }).ok, false);
  assert.equal(validateProximityDropBody({ title: "   " }).ok, false);
  assert.equal(validateProximityDropBody({ title: 42 }).ok, false);

  const ok = validateProximityDropBody(samplePayload);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.payload, samplePayload);
  }

  const trimmed = validateProximityDropBody({ title: "  Tiramisu  ", category: "SUCRE" });
  assert.equal(trimmed.ok, true);
  if (trimmed.ok) {
    assert.equal(trimmed.payload.title, "Tiramisu");
    assert.equal(trimmed.payload.category, "SUCRE");
  }

  // Body invalide → aucune entrée consommable créée (pas d’appel create).
  const store = new ProximityDropStore();
  const bad = validateProximityDropBody({ title: "" });
  assert.equal(bad.ok, false);
  assert.deepEqual(store.consume("never-created"), {
    ok: false,
    error: "not_found"
  });
});
