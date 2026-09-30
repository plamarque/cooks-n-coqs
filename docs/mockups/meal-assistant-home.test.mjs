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
    await page.locator("#thinking").waitFor();
    assert.match(await page.locator("#thinking-message").innerText(), /Je regarde dans votre cahier/);
    await page.locator("#notebook-result.is-visible").waitFor();
    assert.equal(await page.locator("#custom-result").isVisible(), false);

    await page.locator("#recipe-preview").click();
    assert.match(await page.locator("#toast").innerText(), /ouverture de la recette/);
    await page.getByRole("button", { name: "Abandonner" }).click();
    assert.equal(await page.locator("#notebook-result").isVisible(), false);
  });
});

test("maquette accueil assistant — starters sous le compositeur et envoi sans défilement imposé", async () => {
  await withPage(async (page) => {
    assert.equal(await page.evaluate(() => {
      const suggestions = document.querySelector(".suggestions");
      const composer = document.querySelector("#composer");
      return Boolean(suggestions && composer && composer.compareDocumentPosition(suggestions) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), true);
    await page.locator("#brief").fill("Un dîner rapide avec ce qu’il reste.");
    await page.locator("#send").scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    await page.locator("#send").click();
    assert.equal(await page.locator("#thinking").isVisible(), true);
    await page.locator("#notebook-result.is-visible").waitFor();
    assert.equal(await page.evaluate(() => window.scrollY), before);
  });
});

test("maquette accueil assistant — le compositeur route import, recherche et création", async () => {
  await withPage(async (page) => {
    await page.locator("#brief").fill("https://example.test/ma-recette");
    await page.locator("#send").click();
    assert.match(await page.locator("#thinking-message").innerText(), /reconnais ce lien/);
    await page.locator("#notebook-result.is-visible").waitFor();
    assert.match(await page.locator("#result-status").innerText(), /Lien reconnu/);

    await page.getByRole("button", { name: "Abandonner" }).click();
    await page.locator("#image-input").setInputFiles({ name: "frigo.png", mimeType: "image/png", buffer: Buffer.from("mock") });
    assert.equal(await page.locator("#attachment").isVisible(), true);
    await page.locator("#send").click();
    assert.match(await page.locator("#thinking-message").innerText(), /lis votre image/);
    await page.locator("#notebook-result.is-visible").waitFor();
    assert.match(await page.locator("#result-status").innerText(), /Image reconnue/);

    await page.getByRole("button", { name: "Abandonner" }).click();
    await page.locator("#remove-attachment").click();
    await page.locator("#brief").fill("Invente-moi un dîner végétarien vraiment rapide");
    await page.locator("#send").click();
    await page.locator("#custom-result.is-visible").waitFor();
  });
});

test("maquette accueil assistant — brief requis et idées réutilisables", async () => {
  await withPage(async (page) => {
    await page.locator("#send").click();
    assert.match(await page.locator("#brief-error").innerText(), /Collez un lien/);
    await page.getByRole("button", { name: "Un repas frais du frigo" }).click();
    assert.match(await page.locator("#brief").inputValue(), /reste dans le frigo/);
    await page.locator("#send").click();
    await page.locator("#notebook-result.is-visible").waitFor();
    await page.getByRole("button", { name: "Abandonner" }).click();
    assert.equal(await page.locator("#notebook-result").isVisible(), false);
  });
});

test("maquette accueil assistant — alternative sans JavaScript documentée", async () => {
  const html = await import("node:fs/promises").then(({ readFile }) => readFile(mockupPath, "utf8"));
  assert.match(html, /<noscript>/);
  assert.match(html, /alternative texte au micro/);
  assert.match(html, /lien, une recette, une image/);
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
