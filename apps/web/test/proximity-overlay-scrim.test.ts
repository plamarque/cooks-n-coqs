import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const webSrcDir = resolve(import.meta.dirname, "../src");
const componentsDir = resolve(webSrcDir, "components");
const SCRIM = "rgba(29, 31, 28, 0.45)";
const SCRIM_RE = SCRIM.replace(/[().]/g, "\\$&");
const FRAGILE_HAS = /\.p-dialog-mask\s*:has\s*\(\s*\.proximity-/;

const overlays = [
  {
    file: "ProximityQrShareOverlay.vue",
    dialogClass: "proximity-qr-share-dialog",
    maskClass: "proximity-qr-share-mask",
    dismissableMask: true
  },
  {
    file: "ProximityReceiveConfirmOverlay.vue",
    dialogClass: "proximity-receive-confirm-dialog",
    maskClass: "proximity-receive-confirm-mask",
    dismissableMask: true
  },
  {
    file: "ProximityReceiveInstallLanding.vue",
    dialogClass: "proximity-receive-install-dialog",
    maskClass: "proximity-receive-install-mask",
    dismissableMask: false
  },
  {
    file: "ProximityReceiveUpdateBarrier.vue",
    dialogClass: "proximity-receive-update-dialog",
    maskClass: "proximity-receive-update-mask",
    dismissableMask: false
  }
] as const;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(vue|ts|css)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function unscopedStyleBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /<style(?![^>]*\bscoped\b)[^>]*>([\s\S]*?)<\/style>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    blocks.push(match[1] ?? "");
  }
  return blocks;
}

for (const overlay of overlays) {
  test(`scrim mask pt — ${overlay.file} : classe mask dédiée + couleur DESIGN, sans :has`, () => {
    const source = readFileSync(resolve(componentsDir, overlay.file), "utf8");

    assert.equal(
      FRAGILE_HAS.test(source),
      false,
      `${overlay.file} ne doit plus utiliser .p-dialog-mask:has(.proximity-…)`
    );

    assert.match(
      source,
      new RegExp(
        `:pt="\\{\\s*mask:\\s*\\{\\s*class:\\s*'${overlay.maskClass}'\\s*\\}\\s*\\}"`
      ),
      `${overlay.file} doit passer pt.mask.class='${overlay.maskClass}'`
    );

    const unscoped = unscopedStyleBlocks(source).join("\n");
    assert.match(
      unscoped,
      new RegExp(`\\.${overlay.maskClass}\\s*\\{`),
      `${overlay.file} : règles .${overlay.maskClass} dans <style> non scopé (mask téléporté)`
    );
    assert.match(
      unscoped,
      new RegExp(
        `\\.${overlay.maskClass}\\s*\\{[\\s\\S]*?--px-mask-background:\\s*${SCRIM_RE}`
      ),
      `${overlay.file} doit poser --px-mask-background (anim Aura)`
    );
    assert.match(
      unscoped,
      new RegExp(
        `\\.${overlay.maskClass}\\s*\\{[\\s\\S]*?background:\\s*${SCRIM_RE}`
      ),
      `${overlay.file} doit poser background scrim DESIGN`
    );

    assert.match(
      source,
      new RegExp(`class="${overlay.dialogClass}"`),
      `${overlay.file} conserve class dialog ${overlay.dialogClass}`
    );

    assert.match(
      source,
      new RegExp(
        `\\.${overlay.dialogClass}\\.p-dialog\\s*\\{[\\s\\S]*?border-radius:\\s*1rem`
      ),
      `${overlay.file} conserve radius/shadow du sheet dialog`
    );

    const dismissAttr = overlay.dismissableMask
      ? `:dismissable-mask="true"`
      : `:dismissable-mask="false"`;
    assert.ok(
      source.includes(dismissAttr),
      `${overlay.file} conserve ${dismissAttr}`
    );
  });
}

test("scrim mask pt — aucun .p-dialog-mask:has(.proximity- dans apps/web/src", () => {
  const hits: string[] = [];
  for (const file of listSourceFiles(webSrcDir)) {
    const source = readFileSync(file, "utf8");
    if (FRAGILE_HAS.test(source)) {
      hits.push(file);
    }
  }
  assert.deepEqual(hits, [], `sélecteurs fragiles restants: ${hits.join(", ")}`);
});
