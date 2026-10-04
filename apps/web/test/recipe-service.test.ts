import assert from "node:assert/strict";
import test from "node:test";
import { shouldProxyImageUrl } from "../src/services/recipe-service";

test("illustration de démarrage servie par l’application : chargement direct, sans BFF", () => {
  assert.equal(
    shouldProxyImageUrl("https://patrices-macbook-pro.tail3f7249.ts.net/seed/cookie-recipe.png", "https://patrices-macbook-pro.tail3f7249.ts.net"),
    false
  );
});

test("illustration distante : proxy BFF conservé", () => {
  assert.equal(shouldProxyImageUrl("https://images.example.test/cookie.png", "https://patrices-macbook-pro.tail3f7249.ts.net"), true);
});
