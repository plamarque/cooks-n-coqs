import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(webRoot, "..", "..");
const appVue = readFileSync(join(webRoot, "src", "App.vue"), "utf8");

test("Partager reste branché sur shareSelectedRecipeNative (pas de QR)", () => {
  assert.match(appVue, /aria-label="Partager cette recette"/);
  assert.match(appVue, /@click="shareSelectedRecipeNative"/);
  assert.doesNotMatch(appVue, /ProximityQrShareOverlay|openProximityMode[AB]Share/);
});

test("cold open /r — aucun bootstrap ni overlay réception proximité", () => {
  assert.doesNotMatch(appVue, /bootstrapProximityReceiveFromUrl|ProximityReceive/);
  assert.equal(existsSync(join(webRoot, "src", "services", "proximity-receive-service.ts")), false);
  assert.equal(existsSync(join(webRoot, "src", "components", "ProximityReceiveConfirmOverlay.vue")), false);
});

test("aucun chemin produit create/consume drop côté client", () => {
  assert.doesNotMatch(appVue, /createProximityDrop|consumeProximityDrop|proximity-drop-client/);
  assert.equal(existsSync(join(webRoot, "src", "services", "proximity-drop-client.ts")), false);
  assert.equal(existsSync(join(webRoot, "src", "services", "proximity-transfer-service.ts")), false);
  assert.equal(existsSync(join(repoRoot, "apps", "bff", "src", "proximity-drop-store.ts")), false);
  const bffServer = readFileSync(join(repoRoot, "apps", "bff", "src", "server.ts"), "utf8");
  assert.doesNotMatch(bffServer, /\/api\/proximity-drop/);
});

test("e2e proximité UI retiré", () => {
  assert.equal(existsSync(join(repoRoot, "e2e", "proximity-app-wiring.spec.js")), false);
});

test("qrcode.vue plus dans les deps web", () => {
  const pkg = JSON.parse(readFileSync(join(webRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  assert.equal(pkg.dependencies?.["qrcode.vue"], undefined);
});
