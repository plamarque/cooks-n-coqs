import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";

const mockupPath = new URL("./meal-assistant-home.html", import.meta.url);

async function withPage(run) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  try {
    await page.goto(pathToFileURL(mockupPath.pathname).href);
    return await run(page);
  } finally {
    await browser.close();
  }
}

test("maquette accueil assistant — parcours voix, cahier et recette sur mesure", async () => {
  assert.ok(existsSync(mockupPath));

  await withPage(async (page) => {
    await assert.doesNotReject(() => page.locator("#brief").waitFor());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

    await page.locator("#micro").click();
    assert.equal(await page.locator("#recording").isVisible(), true);
    assert.equal(await page.locator("#micro").getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#stop").isVisible(), true);
    assert.equal(await page.locator("#cancel").isVisible(), true);

    await page.locator("#cancel").click();
    assert.equal(await page.locator("#recording").isVisible(), false);
    assert.equal(await page.locator("#brief").inputValue(), "");

    await page.locator("#brief").fill("J’ai déjà des courgettes. Ensuite je verrai.");
    await page.locator("#brief").evaluate((field) => {
      const index = field.value.indexOf(" Ensuite");
      field.setSelectionRange(index, index);
    });
    await page.locator("#micro").click();
    await page.locator("#stop").click();
    assert.equal(await page.locator("#recording").isVisible(), false);
    assert.match(await page.locator("#brief").inputValue(), /courgettes\. J’ai des champignons.*Ensuite je verrai/);
    assert.equal(await page.locator("#composer").getAttribute("class"), "composer");

    await page.locator("#send").click();
    await page.locator("#notebook-result.is-visible").waitFor();
    assert.equal(await page.locator("#custom-result").isVisible(), false);

    await page.locator("#offer-custom").click();
    await page.locator("#custom-result.is-visible").waitFor();
    assert.equal(await page.locator("#notebook-result").isVisible(), false);
    assert.match(await page.locator("#custom-result").innerText(), /Créer cette recette/);
  });
});

test("maquette accueil assistant — brief requis et idées réutilisables", async () => {
  await withPage(async (page) => {
    await page.locator("#send").click();
    assert.match(await page.locator("#brief-error").innerText(), /Décrivez une envie/);
    await page.getByRole("button", { name: "Un repas frais du frigo" }).click();
    assert.match(await page.locator("#brief").inputValue(), /reste dans le frigo/);
    await page.locator("#send").click();
    await page.locator("#notebook-result.is-visible").waitFor();
    await page.getByRole("button", { name: "Ajuster le brief" }).click();
    assert.equal(await page.locator("#notebook-result").isVisible(), false);
  });
});

test("maquette accueil assistant — alternative sans JavaScript documentée", async () => {
  const html = await import("node:fs/promises").then(({ readFile }) => readFile(mockupPath, "utf8"));
  assert.match(html, /<noscript>/);
  assert.match(html, /alternative texte au micro/);
  assert.doesNotMatch(html, /<img/);
});

test("maquette accueil assistant — carrousel navigable au clavier", async () => {
  await withPage(async (page) => {
    const before = await page.locator("#track").evaluate((track) => track.scrollLeft);
    await page.locator("#track").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    const after = await page.locator("#track").evaluate((track) => track.scrollLeft);
    assert.ok(after > before);
  });
});
