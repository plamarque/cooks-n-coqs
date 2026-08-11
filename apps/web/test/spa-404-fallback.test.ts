import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const distDir = resolve(import.meta.dirname, "../dist");
const indexPath = resolve(distDir, "index.html");
const fallbackPath = resolve(distDir, "404.html");

test("spa-404-fallback — dist/404.html copié depuis index.html après build", (t) => {
  if (!existsSync(distDir)) {
    t.skip("dist/ absent — lancer `npm run build -w @cookies-et-coquilettes/web` pour activer ce test");
    return;
  }

  assert.ok(
    existsSync(indexPath),
    "dist/index.html manquant — le build web semble incomplet"
  );
  assert.ok(
    existsSync(fallbackPath),
    "dist/404.html manquant — le plugin spa-404-fallback n’a pas copié index.html"
  );
  assert.equal(
    readFileSync(indexPath, "utf8"),
    readFileSync(fallbackPath, "utf8"),
    "dist/404.html doit être une copie exacte de dist/index.html"
  );
});
