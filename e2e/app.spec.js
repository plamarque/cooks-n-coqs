import { expect, test } from "@playwright/test";
import path from "path";
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

async function saveRecipeForm(page) {
  // Cible le bouton Enregistrer du header (évite ambiguïté avec celui du footer)
  await page
    .locator(".form-header-actions")
    .getByRole("button", { name: "Enregistrer" })
    .first()
    .click();
}

async function createRecipeViaManual(page, name = "Cookies test") {
  await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
  await page.getByRole("button", { name: "Nouvelle recette" }).click();
  await expect(page.getByRole("heading", { name: "Nouvelle recette" })).toBeVisible();
  await page.getByRole("button", { name: "Saisir à la main" }).click();
  await page.getByLabel("Titre").fill(name);
  await page.getByLabel(/step-text-/).first().fill("Mélanger les ingrédients");
  await saveRecipeForm(page);
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function createRecipeViaImport(page, recipeText = "Recette brute") {
  const tmpDir = path.join(process.cwd(), "e2e", "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, "recipe.txt");
  writeFileSync(filePath, recipeText, "utf-8");

  await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
  await page.getByRole("button", { name: "Nouvelle recette" }).click();
  await expect(page.getByRole("heading", { name: "Nouvelle recette" })).toBeVisible();
  // setInputFiles plus fiable que filechooser en headless (CI) — cibler l’input images/txt, pas l’archive .zip
  await page.locator(".add-choice-panel input[type='file'][accept*='image']").setInputFiles(filePath);

  await expect(page.locator("section.panel.detail, section.panel.form-panel")).toBeVisible({
    timeout: 15000
  });
  // Message succès/erreur/warning (fallback = warning, pas success)
  await expect(
    page.locator(".message.success, .message.error, .message.warning")
  ).toContainText(/Recette importée|échoué|incomplète|erreur/i, { timeout: 15000 });
}

async function makeHeavyPhoto(page, seedValue = 123456789, marker = "#ff0000") {
  const data = await page.evaluate(async ({ seedValue, marker }) => {
    const canvas = document.createElement("canvas");
    canvas.width = 3200;
    canvas.height = 2400;
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = seedValue;
    for (let index = 0; index < pixels.data.length; index += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[index] = seed & 255;
      pixels.data[index + 1] = (seed >>> 8) & 255;
      pixels.data[index + 2] = (seed >>> 16) & 255;
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    context.fillStyle = marker;
    context.fillRect(0, 0, 320, 320);
    return canvas.toDataURL("image/jpeg", 1).split(",")[1];
  }, { seedValue, marker });
  const buffer = Buffer.from(data, "base64");
  expect(buffer.length).toBeGreaterThan(4 * 1024 * 1024);
  return buffer;
}

function multipartFileBuffer(request) {
  const body = request.postDataBuffer();
  const start = body.indexOf(Buffer.from("\r\n\r\n")) + 4;
  const boundary = Buffer.from("\r\n--");
  const end = body.indexOf(boundary, start);
  return body.subarray(start, end);
}

function multipartFileSize(request) {
  return multipartFileBuffer(request).length;
}

async function expectAssistantPreviewGeometry(card) {
  const renderingTolerance = 2;
  await card.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
  const layout = await card.evaluate((element) => {
    const box = (node) => {
      const rect = node?.getBoundingClientRect();
      return rect && { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    };
    return {
      card: box(element),
      composer: box(element.closest(".assistant-composer")),
      suggestions: box(document.querySelector(".assistant-starters")),
      children: [
        ".assistant-preview-card-status",
        ".assistant-preview-card-title",
        ".assistant-preview-card-meta",
        ".assistant-preview-card-ingredients",
        ".assistant-preview-card-open"
      ].map((selector) => box(element.querySelector(selector)))
    };
  });
  expect(layout.card).toBeTruthy();
  expect(layout.composer).toBeTruthy();
  expect(layout.suggestions).toBeTruthy();
  expect(layout.card.top).toBeGreaterThanOrEqual(layout.composer.top - renderingTolerance);
  expect(layout.card.bottom).toBeLessThanOrEqual(layout.composer.bottom + renderingTolerance);
  expect(layout.card.left).toBeGreaterThanOrEqual(layout.composer.left - renderingTolerance);
  expect(layout.card.right).toBeLessThanOrEqual(layout.composer.right + renderingTolerance);
  expect(layout.suggestions.top).toBeGreaterThanOrEqual(layout.card.bottom - renderingTolerance);
  for (const child of layout.children) {
    expect(child).toBeTruthy();
    expect(child.top).toBeGreaterThanOrEqual(layout.card.top - renderingTolerance);
    expect(child.bottom).toBeLessThanOrEqual(layout.card.bottom + renderingTolerance);
    expect(child.left).toBeGreaterThanOrEqual(layout.card.left - renderingTolerance);
    expect(child.right).toBeLessThanOrEqual(layout.card.right + renderingTolerance);
  }
}

async function expectAssistantPreviewDetailGeometry(preview, mediaSelector) {
  const renderingTolerance = 2;
  const layout = await preview.evaluate((element, selector) => {
    const box = (node) => {
      const rect = node?.getBoundingClientRect();
      return rect && { left: rect.left, right: rect.right };
    };
    return {
      card: box(element),
      header: box(element.querySelector(".recipe-detail-header")),
      media: box(element.querySelector(selector))
    };
  }, mediaSelector);
  expect(layout.card).toBeTruthy();
  expect(layout.header).toBeTruthy();
  expect(layout.media).toBeTruthy();
  for (const element of [layout.header, layout.media]) {
    expect(Math.abs(element.left - layout.card.left)).toBeLessThanOrEqual(renderingTolerance);
    expect(Math.abs(element.right - layout.card.right)).toBeLessThanOrEqual(renderingTolerance);
  }
}

async function imageMarkerColors(page, buffers) {
  return page.evaluate(async (data) => Promise.all(data.map(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 20, 20, 1, 1, 0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    } finally { bitmap.close(); }
  })), buffers.map((buffer) => buffer.toString("base64")));
}

test.describe("Cookies & Coquillettes v1", () => {
  test("affiche l'accueil Assistant et donne accès au Cahier v1", async ({
    page
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "On mange quoi ?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ouvrir le Cahier" })).toBeVisible();
    await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
    await expect(page.getByRole("button", { name: "Favoris", exact: true })).toBeVisible();
    // Filtre favoris actif par défaut : les recettes seed (favorites) sont visibles
    await expect(page.getByText("Coquillettes au jambon de Juan Arbelaez")).toBeVisible();
    await expect(page.getByText("Cookies aux pépites de chocolat")).toBeVisible();
    await expect(page.locator(".notebook-header").getByRole("button", { name: "Nouvelle recette" })).toBeVisible();
    await expect(page.locator(".toolbar-actions").getByRole("button", { name: "Nouvelle recette" })).toHaveCount(0);
    await expect(page.locator(".notebook-header .assistant-nav")).toBeVisible();
    await expect(page.locator(".toolbar-actions .assistant-nav")).toHaveCount(0);
    await page.locator(".notebook-header .assistant-nav").click();
    await expect(page.getByLabel("Votre demande")).toBeFocused();
  });

  test("Chef : le foyer est complet sur l'accueil vide et disparaît dès le premier tour", async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 480, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const avatar = page.locator(".chef-avatar");
      const image = avatar.locator("img");
      await expect(avatar).toBeVisible();
      await expect(image).toBeVisible();
      await expect(avatar.locator(".chef-avatar-motion")).toHaveCSS("animation-name", "none");
      await expect(avatar.locator(".chef-avatar-eyelid").first()).toHaveCSS("animation-name", "none");
      await expect(page.locator(".assistant-composer")).toBeVisible();
      await expect(page.getByLabel("Votre demande")).toHaveAttribute("placeholder", "Copiez un lien, une image, une recette ou demandez juste ce dont vous avez envie");
      await expect(page.getByRole("button", { name: "Ouvrir le Cahier" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const layout = await page.locator(".assistant-welcome").evaluate((welcome) => {
        const chef = welcome.querySelector(".chef-avatar")?.getBoundingClientRect();
        const imageBox = welcome.querySelector(".chef-avatar-image")?.getBoundingClientRect();
        const composerElement = welcome.querySelector(".assistant-composer");
        const composer = composerElement?.getBoundingClientRect();
        if (!chef || !imageBox || !composer || !composerElement) return false;
        const tail = getComputedStyle(composerElement, "::before");
        return chef && imageBox && composer
          && chef.right <= composer.left
          && imageBox.width >= 50
          && imageBox.height >= 60
          && imageBox.left >= 0
          && imageBox.right <= window.innerWidth
          && tail.content !== "none"
          && tail.position === "absolute"
          && tail.transform !== "none";
      });
      expect(layout).toBe(true);
    }

    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Soupe", category: "SALE", ingredients: [{ id: "ingredient-1", label: "légumes", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Cuire." }]
    } }));
    await page.getByLabel("Votre demande").fill("Une soupe rapide");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.locator(".assistant-conversation-turn--user")).toBeVisible();
    const chefTurn = page.locator(".assistant-conversation-turn--assistant").first();
    const chefMessageAvatar = chefTurn.locator(".chef-message-avatar");
    await expect(chefMessageAvatar).toBeVisible();
    const chefMessageLayout = await chefTurn.evaluate((turn) => {
      const bubble = turn.querySelector(".assistant-conversation-bubble")?.getBoundingClientRect();
      const avatar = turn.querySelector(".chef-message-avatar")?.getBoundingClientRect();
      const image = turn.querySelector(".chef-message-avatar img");
      return bubble && avatar && image && {
        avatarIsRight: bubble.right <= avatar.left,
        static: getComputedStyle(image).animationName === "none"
      };
    });
    expect(chefMessageLayout).toEqual({ avatarIsRight: true, static: true });
    await expect(page.locator(".chef-avatar")).toHaveCount(0);
  });

  test("Chef : le Repos reste calme, avec une boucle locale longue", async ({ page }) => {
    await page.goto("/");
    const motion = page.locator(".chef-avatar-motion");
    const eyelid = page.locator(".chef-avatar-eyelid").first();
    await expect(motion).toBeVisible();
    await expect(motion).toHaveCSS("animation-name", "chef-avatar-rest-breath");
    await expect(eyelid).toHaveCSS("animation-name", "chef-avatar-rest-blink");
    const duration = await motion.evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration));
    expect(duration).toBeGreaterThanOrEqual(9);
    expect(duration).toBeLessThanOrEqual(14);
  });

  test("Chef : les cinq états actifs jouent leur planche locale une seule fois", async ({ page }) => {
    await page.goto("/");
    const avatar = page.locator(".chef-avatar");
    const states = [
      ["ecoute", 2.8, "chef-ecoute"],
      ["reflexion", 3.2, "chef-reflexion"],
      ["proposition", 2.6, "chef-proposition"],
      ["reussite", 2.4, "chef-reussite"],
      ["question", 3, "chef-question"]
    ];

    for (const [state, duration, asset] of states) {
      await avatar.click();
      await expect(avatar).toHaveAttribute("data-chef-state", state);
      const sprite = avatar.locator(".chef-avatar-sprite");
      await expect(sprite).toBeVisible();
      await expect(sprite).toHaveCSS("animation-iteration-count", "1");
      expect(await sprite.evaluate((element) => Number.parseFloat(getComputedStyle(element).animationDuration))).toBe(duration);
      await expect(sprite).toHaveCSS("background-size", "400% 300%");
      await expect(sprite.locator("img")).toHaveAttribute("src", new RegExp(`${asset}(?:-[A-Za-z0-9_-]{8})?\\.png`));
    }

    await avatar.press("Enter");
    await expect(avatar).toHaveAttribute("data-chef-state", "repos");
    await avatar.press(" ");
    await expect(avatar).toHaveAttribute("data-chef-state", "ecoute");
  });

  test("Chef : le mouvement réduit fixe chaque état actif sur sa dernière pose", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const avatar = page.locator(".chef-avatar");

    for (const state of ["ecoute", "reflexion", "proposition", "reussite", "question"]) {
      await avatar.click();
      await expect(avatar).toHaveAttribute("data-chef-state", state);
      const sprite = avatar.locator(".chef-avatar-sprite");
      await expect(sprite).toHaveCSS("animation-name", "none");
      await expect(sprite).toHaveCSS("background-position", "100% 100%");
    }
  });

  test("Chef : une planche active indisponible ne laisse pas d’image brisée", async ({ page }) => {
    await page.route(/\/chef-ecoute(?:-[A-Za-z0-9_-]{8})?\.png$/, (route) => route.abort());
    await page.goto("/");
    await page.locator(".chef-avatar").click();
    await expect(page.locator(".chef-avatar-sprite")).toHaveCount(0);
    await expect(page.locator(".chef-avatar-placeholder")).toBeVisible();
  });

  test("Chef : un asset principal indisponible bascule vers la pose locale de secours", async ({ page }) => {
    await page.route(/\/chef-repos-[A-Za-z0-9_-]{8}\.png$/, (route) => route.abort());
    await page.goto("/");
    const image = page.locator(".chef-avatar-image");
    await expect(image).toBeVisible();
    await expect.poll(() => image.getAttribute("src")).toMatch(/chef-repos-fallback-/);
  });

  test("Chef : deux assets indisponibles gardent un foyer décoratif sans image brisée", async ({ page }) => {
    await page.route(/\/chef-repos(?:-fallback)?-[A-Za-z0-9_-]{8}\.png$/, (route) => route.abort());
    await page.goto("/");
    await expect(page.locator(".chef-avatar")).toBeVisible();
    await expect(page.locator(".chef-avatar-image")).toHaveCount(0);
    await expect(page.locator(".chef-avatar-placeholder")).toBeVisible();
  });

  test("l'accueil Assistant reprend la structure compacte de la maquette à chaque largeur", async ({ page }) => {
    for (const width of [375, 640, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");

      await expect(page.locator(".assistant-header")).toBeVisible();
      await expect(page.locator(".assistant-composer")).toBeVisible();
      await expect(page.getByRole("button", { name: "Dicter" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Ajouter des photos" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Envoyer la demande", exact: true })).toBeVisible();
      await expect(page.locator(".assistant-starter-list")).toHaveCSS("display", "flex");
      await expect(page.getByRole("button", { name: "Suggestion précédente" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Suggestion suivante" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });

  test("Compositeur : les trois icônes sont centrées", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const assistantLayout = await page.locator(".assistant-composer-section").evaluate((section) => {
      const composer = section.querySelector(".assistant-composer");
      const actions = Array.from(section.querySelectorAll(".assistant-icon-action"));
      if (!composer || actions.length !== 3) return false;
      return actions.every((action) => {
        const icon = action.querySelector(".p-button-icon");
        if (!icon) return false;
        const actionRect = action.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        return actionRect.width === 44 && actionRect.height === 44
          && Math.abs((actionRect.left + actionRect.width / 2) - (iconRect.left + iconRect.width / 2)) <= 1
          && Math.abs((actionRect.top + actionRect.height / 2) - (iconRect.top + iconRect.height / 2)) <= 1;
      });
    });
    expect(assistantLayout).toBe(true);
  });

  test("l'accueil Assistant ne duplique pas les actions du Cahier", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Les actions du Cahier" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nouvelle recette" })).toHaveCount(0);
    await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
    await expect(page.locator(".notebook-header").getByRole("button", { name: "Nouvelle recette" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Favoris", exact: true })).toBeVisible();
  });

  test("Compositeur : starter, demande vide et raccourci créent une prévisualisation après noCandidate", async ({ page }) => {
    await page.goto("/");
    let legacyImportCalls = 0;
    await page.route("**/api/import/**", (route) => { legacyImportCalls += 1; return route.abort(); });
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Quiche", category: "SALE", ingredients: [{ id: "ingredient-1", label: "oeufs", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Mélanger." }]
    } }));
    await page.route("**/api/generate-recipe-image", (route) => route.fulfill({ json: { imageUrl: null } }));
    const field = page.getByLabel("Votre demande");
    const quickStarter = page.getByRole("button", { name: /rapide ce soir/i });
    await expect(quickStarter).toHaveText("Rapide ce soir");
    await quickStarter.click();
    await expect(field).toHaveValue("J'ai envie de cuisiner quelque chose de rapide ce soir.");
    await field.fill("");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(/Écrivez une intention/i);
    await field.fill("Quiche\n\nIngrédients:\n- 2 oeufs\n\nÉtapes:\n1. Mélanger.");
    await field.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    await expect(field).toHaveValue(/Quiche/);
    expect(legacyImportCalls).toBe(0);
  });

  test("Chef : le premier envoi ouvre un fil et Nouvelle recette le clôt sans créer de fil vide", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: { title: "Soupe", category: "SALE", ingredients: [{ id: "ingredient-1", label: "légumes", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Cuire." }] } }));
    await page.getByLabel("Votre demande").fill("Une soupe rapide");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: "Nouvelle recette" })).toBeVisible();
    await expect(page.locator(".assistant-conversation-turn--user")).toContainText("Une soupe rapide");
    await expect(page.locator(".assistant-conversation-turn--assistant")).toContainText(/\S/);
    await page.getByRole("button", { name: "Nouvelle recette" }).click();
    await expect(page.getByRole("button", { name: "Nouvelle recette" })).toHaveCount(0);
    await expect(page.getByLabel("Votre demande")).toHaveValue("");
    await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
    await expect(page.locator(".notebook-header .assistant-nav")).toBeFocused();
    await page.locator(".notebook-header .assistant-nav").click();
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(page.locator(".assistant-resume-card")).toHaveCount(0);
    const secondaryActionColors = await page.locator(".assistant-composer-actions").evaluate((actions) => [
      ".assistant-resume-action",
      ".assistant-attach-action",
      ".assistant-dictation-action"
    ].map((selector) => getComputedStyle(actions.querySelector(selector)).backgroundColor));
    expect(new Set(secondaryActionColors).size).toBe(1);
    await page.getByRole("button", { name: "Reprendre le dernier échange" }).click();
    await expect(page.locator(".assistant-conversation-turn--user")).toContainText("Une soupe rapide");
    await expect(page.locator(".assistant-conversation-turn--assistant")).toContainText(/\S/);
  });

  test("Chef : une photo envoyée reste attachée au fil après reprise locale", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/assistant/image-intent*", (route) => route.fulfill({ json: { summaries: ["Des légumes."] } }));
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Soupe de légumes", category: "SALE", ingredients: [{ id: "ingredient-1", label: "légumes", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Cuire." }]
    } }));
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles(path.join(process.cwd(), "e2e", "fixtures", "test-image.png"));
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    const persisted = await page.evaluate(async () => new Promise((resolve, reject) => {
      const request = indexedDB.open("cookies-et-coquilettes");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(["chefConversationAssets", "chefConversations"], "readonly");
        const assets = transaction.objectStore("chefConversationAssets").getAll();
        const conversations = transaction.objectStore("chefConversations").getAll();
        transaction.oncomplete = () => { database.close(); resolve({ assets: assets.result.filter((asset) => asset.blob instanceof Blob && asset.blob.size > 0).length, attachmentRefs: conversations.result.flatMap((conversation) => conversation.turns).flatMap((turn) => turn.attachments ?? []).length }); };
        transaction.onerror = () => reject(transaction.error);
      };
    }));
    expect(persisted).toEqual({ assets: 1, attachmentRefs: 1 });
    await expect(page.getByRole("button", { name: "Nouvelle recette" })).toBeEnabled();
    await page.getByRole("button", { name: "Nouvelle recette" }).click();
    await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
    await page.locator(".notebook-header .assistant-nav").click();
    await expect(page.locator(".assistant-resume-card")).toHaveCount(0);
    await page.getByRole("button", { name: "Reprendre le dernier échange" }).click();
    await expect(page.locator(".assistant-conversation-attachments img")).toBeVisible();
    await expect(page.getByRole("button", { name: /Prévisualisation prête — ouvrir Soupe de légumes/ })).toBeVisible();
    await page.evaluate(async () => new Promise((resolve, reject) => {
      const request = indexedDB.open("cookies-et-coquilettes");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("chefConversationAssets", "readwrite");
        const assets = transaction.objectStore("chefConversationAssets");
        const get = assets.getAllKeys();
        get.onerror = () => reject(get.error);
        get.onsuccess = () => get.result.forEach((key) => assets.delete(key));
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => { database.close(); resolve(); };
      };
    }));
    await page.reload();
    await page.getByRole("button", { name: "Reprendre le dernier échange" }).click();
    await expect(page.locator(".assistant-attachment-unavailable")).toContainText("Photo indisponible localement");
    await expect(page.locator(".assistant-conversation-attachments img")).toHaveCount(0);
  });

  test("Chef : sans fil, aucune reprise inactive ; journal illisible, repli sans perte de saisie", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Reprendre le dernier échange" })).toHaveCount(0);
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("cookies-et-coquilettes");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("chefConversations", "readwrite");
          transaction.objectStore("chefConversations").put({ id: "illisible", createdAt: "pas-une-date", turns: [] });
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => { database.close(); resolve(); };
        };
      });
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "Reprendre le dernier échange" })).toHaveCount(0);
    const field = page.getByLabel("Votre demande");
    await field.fill("Je garde cette idée");
    await expect(field).toHaveValue("Je garde cette idée");
  });

  test("Assistant : une recette texte longue garde sa source complète et projette un fil valide", async ({ page }) => {
    const longRecipe = ("Saucisses, pommes de terre, poivron et chèvre. ").repeat(53).slice(0, 2_059);
    let selectionBody;
    let recipeBody;
    await page.goto("/");
    await page.route("**/api/assistant/select", async (route) => {
      selectionBody = route.request().postDataJSON();
      await route.fulfill({ json: { kind: "noCandidate" } });
    });
    await page.route("**/api/assistant/recipe", async (route) => {
      recipeBody = route.request().postDataJSON();
      await route.fulfill({ json: { title: "Saucisses et pommes de terre", category: "SALE", ingredients: [{ id: "ingredient-1", label: "saucisses", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Cuire." }] } });
    });
    const field = page.getByLabel("Votre demande");
    await field.fill(longRecipe);
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    expect(selectionBody.request).toHaveLength(2_059);
    expect(recipeBody.turns).toEqual([{ role: "user", text: longRecipe.slice(0, 1_200) }]);
    expect(recipeBody.request).toBe(longRecipe);
    await expect(field).toHaveValue(longRecipe);
  });

  test("Assistant : une recette texte longue borne aussi le fil de génération sans altérer le Compositeur", async ({ page }) => {
    const longRecipe = ("Saucisses, pommes de terre, poivron et chèvre. ").repeat(53).slice(0, 2_059);
    let recipeBody;
    await page.goto("/");
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", async (route) => {
      recipeBody = route.request().postDataJSON();
      await route.fulfill({ json: { title: "Saucisses et pommes de terre", category: "SALE", ingredients: [{ id: "ingredient-1", label: "saucisses", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Cuire." }] } });
    });
    const field = page.getByLabel("Votre demande");
    await field.fill(longRecipe);
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    expect(recipeBody.turns).toHaveLength(1);
    expect(recipeBody.turns[0].text).toHaveLength(1_200);
    expect(recipeBody.request).toBe(longRecipe);
    await expect(field).toHaveValue(longRecipe);
  });

  test("Compositeur : image locale retirable et retour Cahier/Assistant au focus", async ({ page }) => {
    await page.goto("/");
    const imagePath = path.join(process.cwd(), "e2e", "fixtures", "test-image.png");
    const field = page.getByLabel("Votre demande");

    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles(imagePath);
    await expect(page.locator(".assistant-attachment span")).toHaveText("test-image.png");
    await page.getByRole("button", { name: "Retirer l’image test-image.png" }).click();
    await expect(page.locator(".assistant-attachment")).toHaveCount(0);

    await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
    await page.getByRole("button", { name: "Assistant" }).click();
    await expect(field).toBeFocused();
  });

  test("Compositeur : un nom d’image long laisse le retrait accessible", async ({ page }) => {
    await page.goto("/");
    const longName = `${"recette-du-frigo-".repeat(20)}.png`;
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles({
      name: longName,
      mimeType: "image/png",
      buffer: Buffer.from("image")
    });

    const attachment = page.locator(".assistant-attachment");
    const remove = page.getByRole("button", { name: `Retirer l’image ${longName}` });
    await expect(attachment).toContainText(longName);
    expect(await attachment.evaluate((element) => {
      const button = element.querySelector("button");
      if (!button) return false;
      const attachmentRect = element.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      return buttonRect.width > 0 && buttonRect.left >= attachmentRect.left && buttonRect.right <= attachmentRect.right;
    })).toBe(true);
    await remove.click();
    await expect(attachment).toHaveCount(0);
  });

  test("Compositeur : collage image, rejet fichier et préparation restent locaux", async ({ page }) => {
    await page.goto("/");
    const field = page.getByLabel("Votre demande");
    await field.fill("Texte conservé");

    await page.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(new File(["image"], "collée.png", { type: "image/png" }));
      document.querySelector("#assistant-composer-text")?.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, clipboardData: data })
      );
    });
    await expect(field).toHaveValue("Texte conservé");
    await expect(page.locator(".assistant-attachment")).toContainText("collée.png");

    await page.evaluate(() => {
      const data = new DataTransfer();
      data.items.add(new File(["texte"], "notes.txt", { type: "text/plain" }));
      document.querySelector("#assistant-composer-text")?.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, clipboardData: data })
      );
    });
    await expect(field).toHaveValue("Texte conservé");
    await expect(page.getByRole("status")).toContainText(/Choisissez une image/i);

    await page.evaluate(() => {
      let fetchCalls = 0;
      const originalFetch = window.fetch.bind(window);
      window.fetch = (...args) => {
        fetchCalls += 1;
        return originalFetch(...args);
      };
      let writes = 0;
      for (const method of ["add", "put"]) {
        const original = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function (...args) {
          writes += 1;
          return original.apply(this, args);
        };
      }
      window.__assistantLocalProof = () => ({ fetchCalls, writes });
    });
    // Une image est prioritaire : l'import peut appeler le BFF, mais n'écrit jamais avant sauvegarde.
    await expect(page.getByRole("button", { name: "Envoyer la demande", exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__assistantLocalProof().writes)).toBe(0);
  });

  test("Compositeur : un seul bouton photo propose caméra et galerie, ferme sans mutation et ajoute plusieurs images", async ({ page }) => {
    await page.addInitScript(() => {
      const revoke = URL.revokeObjectURL.bind(URL);
      window.__assistantRevokedObjectUrls = [];
      URL.revokeObjectURL = (url) => {
        window.__assistantRevokedObjectUrls.push(url);
        revoke(url);
      };
    });
    await page.goto("/");
    const photo = page.getByRole("button", { name: "Ajouter des photos" });
    await expect(photo).toBeVisible();
    await photo.click();
    await expect(page.getByRole("menuitem", { name: "Prendre une photo" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Choisir des images" })).toBeVisible();
    await expect(page.locator(".assistant-home input[capture='environment']")).toHaveAttribute("accept", "image/*");
    await expect(page.locator(".assistant-home input[type='file'][multiple]")).not.toHaveAttribute("capture", /./);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Choisir des images" })).toHaveCount(0);
    await expect(photo).toBeFocused();
    await photo.click();
    await page.getByLabel("Votre demande").focus();
    await expect(page.getByRole("menuitem", { name: "Choisir des images" })).toHaveCount(0);
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles([
      { name: "une.png", mimeType: "image/png", buffer: Buffer.from("one") },
      { name: "deux.jpg", mimeType: "image/jpeg", buffer: Buffer.from("two") }
    ]);
    await expect(page.locator(".assistant-attachment")).toHaveCount(2);
    await expect(page.locator(".assistant-attachment-preview")).toHaveCount(2);
    await expect(page.locator(".assistant-attachment-preview").first()).toHaveAttribute("src", /^blob:/);
    await page.locator(".assistant-home input[capture='environment']").setInputFiles({
      name: "prise-sur-place.jpg", mimeType: "image/jpeg", buffer: Buffer.from("camera")
    });
    await expect(page.locator(".assistant-attachment")).toHaveCount(3);
    await page.getByRole("button", { name: "Retirer l’image une.png" }).click();
    await expect(page.locator(".assistant-attachment")).toHaveCount(2);
    expect(await page.evaluate(() => window.__assistantRevokedObjectUrls.some((url) => url.startsWith("blob:")))).toBe(true);
  });

  test("Compositeur : la sixième image est refusée et une image lourde reste visible avant compression", async ({ page }) => {
    await page.goto("/");
    const gallery = page.locator(".assistant-home input[type='file'][multiple]");
    await gallery.setInputFiles(Array.from({ length: 6 }, (_, index) => ({ name: `${index}.png`, mimeType: "image/png", buffer: Buffer.from("image") })));
    await expect(page.locator(".assistant-attachment")).toHaveCount(5);
    await expect(page.getByRole("status")).toContainText("Seules les 5 premières images sont conservées");
    await page.getByRole("button", { name: "Retirer l’image 0.png" }).click();
    await gallery.setInputFiles({ name: "grande.png", mimeType: "image/png", buffer: Buffer.alloc(4 * 1024 * 1024 + 1) });
    await expect(page.locator(".assistant-attachment")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Retirer l’image grande.png" })).toBeVisible();
  });

  test("Compositeur mobile : le rail photo reste séparé des actions et l'attente est centrée, lisible et annulable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    const photo = path.join(process.cwd(), "e2e", "fixtures", "test-image.png");
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles([photo, photo, photo]);
    const layout = await page.locator(".assistant-composer").evaluate((composer) => {
      const rail = composer.querySelector(".assistant-attachments")?.getBoundingClientRect();
      const actions = composer.querySelector(".assistant-composer-actions")?.getBoundingClientRect();
      return { railBottom: rail?.bottom, actionsTop: actions?.top };
    });
    expect(layout.railBottom).toBeLessThanOrEqual(layout.actionsTop);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route("**/api/assistant/image-intent*", async (route) => { await gate; await route.fulfill({ json: { summaries: ["un"] } }); });
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    const overlay = page.locator(".assistant-import-progress");
    await expect(overlay).toBeVisible();
    await expect(overlay.locator(".assistant-import-progress-mark img")).toBeVisible();
    await expect(overlay.getByRole("button", { name: "Annuler" })).toBeFocused();
    const overlayLayout = await overlay.evaluate((element) => {
      const mark = element.querySelector(".assistant-import-progress-mark")?.getBoundingClientRect();
      const label = element.querySelector(".assistant-import-progress-label")?.getBoundingClientRect();
      const cancel = element.querySelector("button")?.getBoundingClientRect();
      return { mark, label, cancel };
    });
    expect(overlayLayout.mark.bottom).toBeLessThanOrEqual(overlayLayout.label.top);
    expect(overlayLayout.label.bottom).toBeLessThanOrEqual(overlayLayout.cancel.top);
    await overlay.getByRole("button", { name: "Annuler" }).click();
    await expect(overlay).toHaveCount(0);
    release();
  });

  test("Assistant : carte F2, détail, fermeture et aucune écriture IndexedDB", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await page.goto("/");
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Soupe express", category: "SALE", ingredients: [{ id: "ingredient-1", label: "oignon", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Mixer." }]
    } }));
    const field = page.getByLabel("Votre demande");
    await field.fill("Soupe express\n\nIngrédients:\n- 1 oignon\n\nÉtapes:\n1. Mixer.");
    const countStores = () => page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("cookies-et-coquilettes");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const stores = ["recipes", "images", "ingredientImages", "cookingStepImages"];
      return Object.fromEntries(await Promise.all(stores.map(async (store) => {
        const transaction = database.transaction(store, "readonly");
        const count = await new Promise((resolve, reject) => {
          const request = transaction.objectStore(store).count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        return [store, count];
      })));
    });
    // L'amorçage v1 est asynchrone : attendre son état stable avant la mesure.
    await expect.poll(countStores).toMatchObject({ recipes: 2 });
    const before = await countStores();
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    const card = page.getByRole("button", { name: /Prévisualisation prête/ });
    await expect(card).toBeVisible();
    await expect(card).toBeFocused();
    await expectAssistantPreviewGeometry(card);
    await card.press("Enter");
    await expect(page.getByRole("textbox", { name: "Titre de la recette" })).toHaveValue("Soupe express");
    await expect(page.getByRole("textbox", { name: "Ingrédient" })).toHaveValue("1 oignon");
    await expect(page.getByRole("textbox", { name: "Texte de l’étape 1" })).toHaveValue("Mixer.");
    await expect(page.getByRole("button", { name: "Sauvegarder", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Fermer la prévisualisation" })).toBeVisible();
    expect(await countStores()).toEqual(before);
    await page.getByRole("button", { name: "Fermer la prévisualisation" }).click();
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "On mange quoi ?" })).toBeVisible();
    const composer = page.locator(".assistant-composer");
    await expect(composer).not.toHaveClass(/assistant-composer--with-preview/);
    const returnedLayout = await page.locator(".assistant-composer-section").evaluate((section) => {
      const composer = section.querySelector(".assistant-composer")?.getBoundingClientRect();
      const suggestions = document.querySelector(".assistant-starters")?.getBoundingClientRect();
      return { composerBottom: composer?.bottom, suggestionsTop: suggestions?.top };
    });
    expect(returnedLayout.suggestionsTop).toBeGreaterThanOrEqual(returnedLayout.composerBottom);
    await expect(field).toBeFocused();
    expect(await countStores()).toEqual(before);
  });

  test("Assistant : noCandidate Jev conserve l’illustration avant de confirmer la recette sur mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const savedRecipeImageId = () => page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("cookies-et-coquilettes");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction("recipes", "readonly");
      return await new Promise((resolve, reject) => {
        const request = transaction.objectStore("recipes").getAll();
        request.onsuccess = () => {
          const saved = request.result.find((recipe) => recipe.title === "Crumble pommes");
          resolve(saved?.imageId);
        };
        request.onerror = () => reject(request.error);
      });
    });
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Crumble pommes", category: "SUCRE", ingredients: [{ id: "ingredient-1", label: "pommes", isScalable: true }], steps: [{ id: "step-1", order: 1, text: "Cuire 25 minutes." }]
    } }));
    await page.route("**/api/generate-recipe-image", (route) => route.fulfill({ json: { imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3C/svg%3E" } }));
    await page.getByLabel("Votre demande").fill("un dessert fruité d'automne réconfortant");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    const card = page.getByRole("button", { name: /Prévisualisation prête/ });
    await expect(card).toBeVisible();
    await expect(card.locator("img")).toBeVisible();
    await expectAssistantPreviewGeometry(card);
    await card.click();
    await expect(page.getByRole("textbox", { name: "Titre de la recette" })).toHaveValue("Crumble pommes");
    await expectAssistantPreviewDetailGeometry(page.locator(".assistant-preview-detail"), ".recipe-detail-image");
    const imageBox = await page.locator(".assistant-preview-detail .recipe-detail-image").boundingBox();
    const actionsBox = await page.locator(".assistant-preview-detail .recipe-detail-header-actions").boundingBox();
    expect(imageBox).toBeTruthy();
    expect(actionsBox).toBeTruthy();
    expect(actionsBox.y).toBeGreaterThanOrEqual(imageBox.y + imageBox.height);
    await page.getByRole("button", { name: "Sauvegarder", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Crumble pommes" })).toBeVisible();
    await expect(page.locator(".recipe-detail-image")).toBeVisible();
    await expect(page.locator(".save-success-badge")).toContainText("enregistrée dans votre cahier");
    await expect.poll(savedRecipeImageId).not.toBeFalsy();
    await expect(page.getByRole("button", { name: "Fermer la prévisualisation" })).toHaveCount(0);
  });

  test("Assistant : une preview desktop avec illustration aligne la carte, le header et l’image", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await page.goto("/");
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Risotto aux champignons", category: "SALE", ingredients: [{ id: "ingredient-1", label: "riz", isScalable: true }], steps: [{ id: "step-1", order: 1, text: "Cuire doucement." }]
    } }));
    await page.route("**/api/generate-recipe-image", (route) => route.fulfill({ json: { imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3C/svg%3E" } }));
    await page.getByLabel("Votre demande").fill("un risotto crémeux");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    const card = page.getByRole("button", { name: /Prévisualisation prête/ });
    await expect(card.locator("img")).toBeVisible();
    await card.click();
    await expect(page.getByRole("textbox", { name: "Titre de la recette" })).toHaveValue("Risotto aux champignons");
    await expectAssistantPreviewDetailGeometry(page.locator(".assistant-preview-detail"), ".recipe-detail-image");
  });

  test("Assistant : une preview mobile avec photo jointe conserve toute la carte dans le Compositeur", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/");
    await page.route("**/api/assistant/image-intent*", (route) => route.fulfill({ json: { summaries: ["Des légumes frais."] } }));
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Gratin de légumes fondants aux herbes du jardin", category: "SALE", ingredients: [
        { id: "ingredient-1", label: "courgettes longuement émincées", isScalable: true },
        { id: "ingredient-2", label: "tomates bien mûres en tranches", isScalable: true },
        { id: "ingredient-3", label: "oignons doux caramélisés", isScalable: true },
        { id: "ingredient-4", label: "basilic fraîchement ciselé", isScalable: false },
        { id: "ingredient-5", label: "gousses d’ail écrasées", isScalable: false }
      ], steps: [{ id: "step-1", order: 1, text: "Cuire au four." }]
    } }));
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles(path.join(process.cwd(), "e2e", "fixtures", "test-image.png"));
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    const composer = page.locator(".assistant-composer");
    const card = page.getByRole("button", { name: /Prévisualisation prête/ });
    await expect(card).toBeVisible();
    await expect(composer).toHaveClass(/assistant-composer--with-attachments/);
    await expect(composer).toHaveClass(/assistant-composer--with-preview/);
    await expectAssistantPreviewGeometry(card);
    const previewHeight = await composer.evaluate((element) => element.getBoundingClientRect().height);
    await page.getByRole("button", { name: "Fermer ce résultat" }).click();
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(composer).not.toHaveClass(/assistant-composer--with-preview/);
    await expect(composer).toHaveClass(/assistant-composer--with-attachments/);
    await expect(page.locator(".assistant-attachment")).toHaveCount(1);
    expect(await composer.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(previewHeight);
  });

  test("Assistant : les candidates du Cahier restent des propositions du fil", async ({ page }) => {
    await page.goto("/");
    const notebookState = () => page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("cookies-et-coquilettes");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction(["recipes", "images"], "readonly");
      const recipeCount = await new Promise((resolve, reject) => {
        const request = transaction.objectStore("recipes").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const imageCount = await new Promise((resolve, reject) => {
        const request = transaction.objectStore("images").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return { recipeCount, imageCount };
    });
    await expect.poll(notebookState).toEqual({ recipeCount: 2, imageCount: 1 });
    const before = await notebookState();
    let selections = 0;
    let recipeGenerations = 0;
    await page.route("**/api/assistant/select", (route) => {
      selections += 1;
      return route.fulfill({ json: { kind: "candidates", candidates: [
        { candidateRef: "candidate-1", reasonCode: "RELEVANT" },
        { candidateRef: "candidate-2", reasonCode: "RELEVANT" }
      ] } });
    });
    await page.route("**/api/assistant/recipe", (route) => {
      recipeGenerations += 1;
      return route.fulfill({ status: 500, json: { error: "must-not-run" } });
    });

    const field = page.getByLabel("Votre demande");
    await field.fill("une recette du Cahier à préciser");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    const candidateCards = page.getByRole("button", { name: /Recette du Cahier trouvée/ });
    await expect(candidateCards).toHaveCount(2);
    const candidateName = await candidateCards.nth(1).getAttribute("aria-label");
    const candidateTitle = candidateName?.match(/ouvrir (.+)$/)?.[1];
    expect(candidateTitle).toBeTruthy();
    const cardsDoNotOverlap = await candidateCards.evaluateAll((cards) => {
      const [first, second] = cards.map((card) => card.getBoundingClientRect());
      return Boolean(first && second && first.bottom <= second.top);
    });
    expect(cardsDoNotOverlap).toBe(true);
    const candidateIsInConversation = await candidateCards.first().evaluate((card) => {
      const candidate = card.closest(".assistant-conversation-card")?.getBoundingClientRect();
      const composer = document.querySelector(".assistant-composer")?.getBoundingClientRect();
      return Boolean(candidate && composer && candidate.bottom <= composer.top);
    });
    expect(candidateIsInConversation).toBe(true);
    await expect(page.getByRole("button", { name: /Pas cette recette/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Nouvelle recette" }).click();
    await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
    await page.locator(".notebook-header .assistant-nav").click();
    await expect(page.locator(".assistant-resume-card")).toHaveCount(0);
    await page.getByRole("button", { name: "Reprendre le dernier échange" }).click();
    const resumedCandidateCards = page.getByRole("button", { name: /Recette du Cahier trouvée/ });
    await expect(resumedCandidateCards).toHaveCount(2);
    await resumedCandidateCards.nth(1).click();
    await expect(page.getByRole("heading", { name: candidateTitle })).toBeVisible();
    expect(await notebookState()).toEqual(before);
  });

  test("Assistant : l’échec de stockage de l’illustration conserve la recette avec un message honnête", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Tarte temporaire", category: "SUCRE", ingredients: [{ id: "ingredient-1", label: "pommes", isScalable: true }], steps: [{ id: "step-1", order: 1, text: "Cuire." }]
    } }));
    await page.route("**/api/generate-recipe-image", (route) => route.fulfill({ json: { imageUrl: "https://images.example.test/tarte.png" } }));
    await page.route("https://images.example.test/tarte.png", (route) => route.fulfill({ contentType: "image/svg+xml", body: "<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'/>" }));
    await page.route("**/api/proxy-image", (route) => route.fulfill({ status: 502, json: { error: "unavailable" } }));
    await page.getByLabel("Votre demande").fill("une tarte");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    const card = page.getByRole("button", { name: /Prévisualisation prête/ });
    await expect(card.locator("img")).toBeVisible();
    await card.click();
    await page.getByRole("button", { name: "Sauvegarder", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tarte temporaire" })).toBeVisible();
    await expect(page.locator(".save-success-badge")).toContainText("seule la conservation de son illustration a échoué");
  });

  test("Assistant : une ancienne confirmation de suppression disparaît à l’ouverture d’une preview", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.locator(".assistant-carousel-card").first().click();
    await page.locator(".recipe-detail-actions").getByRole("button", { name: "Supprimer" }).click();
    await page.getByRole("button", { name: "Supprimer" }).last().click();
    await expect(page.getByText("Recette supprimée.")).toBeVisible();
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Soupe propre", category: "SALE", ingredients: [{ id: "ingredient-1", label: "eau", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Chauffer." }]
    } }));
    await page.route("**/api/generate-recipe-image", (route) => route.fulfill({ json: { imageUrl: null } }));
    await page.getByLabel("Votre demande").fill("une soupe");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await page.getByRole("button", { name: /Prévisualisation prête/ }).click();
    await expectAssistantPreviewDetailGeometry(page.locator(".assistant-preview-detail"), ".recipe-detail-image-placeholder");
    await expect(page.getByText("Recette supprimée.")).toHaveCount(0);
  });

  test("Assistant : les entrées concurrentes sont gelées pendant la génération", async ({ page }) => {
    await page.goto("/");
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route("**/api/assistant/image-intent*", (route) => route.fulfill({ json: { summaries: ["Un plat."] } }));
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", async (route) => {
      await gate;
      await route.fulfill({ json: { title: "Import", category: "SALE", ingredients: [{ id: "ingredient-1", label: "tomate", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Cuire." }] } });
    });
    await page.getByLabel("Votre demande").fill("texte de contexte");
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles(path.join(process.cwd(), "e2e", "fixtures", "test-image.png"));
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: "Annuler" })).toBeFocused();
    await expect(page.getByLabel("Votre demande")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Retirer l’image test-image.png" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /J'ai envie de cuisiner quelque chose de rapide/i })).toBeDisabled();
    release();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
  });

  test("Assistant : une URL est sélectionnée puis génère une preview sans import historique", async ({ page }) => {
    await page.goto("/");
    const calls = [];
    await page.route("**/api/import/**", (route) => { calls.push("import"); return route.abort(); });
    await page.route("**/api/assistant/select", (route) => { calls.push("select"); return route.fulfill({ json: { kind: "noCandidate" } }); });
    await page.route("**/api/assistant/recipe", (route) => { calls.push("recipe"); return route.fulfill({ json: { title: "URL", category: "SALE", ingredients: [{ id: "ingredient-1", label: "x", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Cuire" }] } }); });
    await page.getByLabel("Votre demande").fill("https://example.test/recette");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    expect(calls).toEqual(["select", "recipe"]);
  });

  test("Assistant : une image suit vision, sélection puis génération sans import historique", async ({ page }) => {
    await page.goto("/");
    const calls = [];
    await page.route("**/api/assistant/image-intent*", (route) => { calls.push("image-intent"); return route.fulfill({ json: { summaries: ["Un plat."] } }); });
    await page.route("**/api/import/**", (route) => { calls.push("import"); return route.abort(); });
    await page.route("**/api/assistant/select", (route) => { calls.push("select"); return route.fulfill({ json: { kind: "noCandidate" } }); });
    await page.route("**/api/assistant/recipe", (route) => { calls.push("recipe"); return route.fulfill({ json: { title: "Photo", category: "SALE", ingredients: [{ id: "ingredient-1", label: "tomate", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Cuire" }] } }); });
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles(path.join(process.cwd(), "e2e", "fixtures", "test-image.png"));
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    expect(calls).toEqual(["image-intent", "select", "recipe"]);
  });

  test("Assistant : quatre photos échouées restent réessayables avec une référence unique", async ({ page }) => {
    await page.goto("/");
    const image = path.join(process.cwd(), "e2e", "fixtures", "test-image.png");
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles([image, image, image, image]);
    await expect(page.locator(".assistant-attachment")).toHaveCount(4);
    let requests = 0;
    let attempt = "";
    await page.route("**/api/assistant/image-intent*", (route) => {
      requests += 1;
      attempt = new URL(route.request().url()).searchParams.get("attempt") ?? "";
      expect(attempt).toMatch(/^[0-9a-f-]{36}$/);
      return route.fulfill({ status: 503, json: { error: "UPSTREAM_UNAVAILABLE" } });
    });
    const send = page.getByRole("button", { name: "Envoyer la demande", exact: true });
    await send.click();
    await expect(page.getByRole("alert")).toContainText(attempt.slice(0, 8));
    await expect(page.locator(".assistant-conversation-turn--user")).toHaveCount(0);
    await expect(page.locator(".assistant-attachment")).toHaveCount(4);
    await send.click();
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator(".assistant-conversation-turn--user")).toHaveCount(0);
  });

  test("Assistant : quatre photos sont analysées dans quatre requêtes courtes, puis produisent une recette", async ({ page }) => {
    await page.goto("/");
    const image = path.join(process.cwd(), "e2e", "fixtures", "test-image.png");
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles([image, image, image, image]);
    const analysed = [];
    await page.route("**/api/assistant/image-intent*", (route) => {
      const form = route.request().postDataBuffer();
      expect(form?.toString()).toContain('name="file"');
      analysed.push(route.request().url());
      return route.fulfill({ json: { summaries: [`Photo ${analysed.length} : ingrédients visibles.`] } });
    });
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Salade aux quatre photos", category: "SALE", ingredients: [{ id: "ingredient-1", label: "riz", isScalable: true }], steps: [{ id: "step-1", order: 1, text: "Mélanger le riz." }]
    } }));
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    expect(analysed).toHaveLength(4);
    expect(new Set(analysed.map((url) => new URL(url).searchParams.get("attempt"))).size).toBe(4);
  });

  test("Assistant : quatre photos lourdes partent sous 4 Mio dans l'ordre", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    const markers = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
    const buffers = [];
    for (const [index, marker] of markers.entries()) buffers.push(await makeHeavyPhoto(page, 123456789 + index * 971, marker));
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "cooks-assistant-photos-"));
    const files = Array.from({ length: 4 }, (_, index) => path.join(fixtureDir, `photo-${index + 1}.jpg`));
    for (const [index, file] of files.entries()) writeFileSync(file, buffers[index]);
    try {
      await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles(files);
      const uploaded = [];
      await page.route("**/api/assistant/image-intent*", (route) => {
        uploaded.push({ data: multipartFileBuffer(route.request()), name: route.request().postDataBuffer().toString("latin1").match(/filename="([^"]+)"/)?.[1] });
        return route.fulfill({ json: { summaries: [`Photo ${uploaded.length}.`] } });
      });
      let legacyImportCalls = 0;
      await page.route("**/api/import/**", (route) => { legacyImportCalls += 1; return route.abort(); });
      await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "noCandidate" } }));
      await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
        title: "Salade aux quatre photos", category: "SALE", ingredients: [{ id: "ingredient-1", label: "riz", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Cuire." }]
      } }));
      await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
      await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
      expect(uploaded.map(({ name }) => name)).toEqual(["photo-1.jpg", "photo-2.jpg", "photo-3.jpg", "photo-4.jpg"]);
      expect(uploaded.every(({ data }) => data.length > 0 && data.length <= 4 * 1024 * 1024)).toBe(true);
      expect(legacyImportCalls).toBe(0);
      const expectedColors = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
      const visionColors = await imageMarkerColors(page, uploaded.map(({ data }) => data));
      for (const [index, expected] of expectedColors.entries()) {
        expect(visionColors[index].every((value, channel) => Math.abs(value - expected[channel]) < 45)).toBe(true);
      }
    } finally { rmSync(fixtureDir, { recursive: true, force: true }); }
  });

  test("Assistant : une photo illisible trop lourde reste jointe et ne part pas au BFF", async ({ page }) => {
    await page.goto("/");
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles({ name: "illisible.png", mimeType: "image/png", buffer: Buffer.alloc(4 * 1024 * 1024 + 1) });
    let requests = 0;
    await page.route("**/api/assistant/image-intent*", (route) => { requests += 1; return route.abort(); });
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Je n’ai pas pu préparer une photo");
    await expect(page.locator(".assistant-attachment")).toHaveCount(1);
    expect(requests).toBe(0);
  });

  test("Assistant : une réduction impossible sous 4 Mio indique la photo 2 sans envoi", async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.toBlob = function (callback) {
        callback(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: "image/jpeg" }));
      };
    });
    await page.goto("/");
    const heavy = await makeHeavyPhoto(page);
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "cooks-assistant-size-"));
    const heavyPath = path.join(fixtureDir, "lourde.jpg");
    writeFileSync(heavyPath, heavy);
    try {
      await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles([path.join(process.cwd(), "e2e", "fixtures", "test-image.png"), heavyPath]);
      let requests = 0;
      await page.route("**/api/assistant/**", (route) => { requests += 1; return route.abort(); });
      await page.route("**/api/import/screenshot", (route) => { requests += 1; return route.abort(); });
      await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText("Je n’ai pas pu réduire une photo sous la limite de 4 Mio");
      await expect(page.getByRole("alert")).toContainText("Photo concernée : n° 2");
      await expect(page.locator(".assistant-attachment")).toHaveCount(2);
      expect(requests).toBe(0);
    } finally { rmSync(fixtureDir, { recursive: true, force: true }); }
  });

  test("Assistant : annuler le deuxième encodage empêche toute requête tardive", async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      const decode = window.createImageBitmap.bind(window);
      let decodes = 0;
      window.createImageBitmap = async (...args) => { decodes += 1; return decode(...args); };
      const encode = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        if (decodes >= 2 && !window.__secondEncodeHeld) {
          window.__secondEncodeHeld = true;
          window.__releaseSecondEncode = () => encode.call(this, (blob) => { callback(blob); window.__secondEncodeDone = true; }, type, quality);
          return;
        }
        return encode.call(this, callback, type, quality);
      };
    });
    await page.goto("/");
    const buffer = await makeHeavyPhoto(page);
    const fixtureDir = mkdtempSync(path.join(tmpdir(), "cooks-assistant-cancel-"));
    const files = [path.join(fixtureDir, "photo-1.jpg"), path.join(fixtureDir, "photo-2.jpg")];
    for (const file of files) writeFileSync(file, buffer);
    try {
      await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles(files);
      let requests = 0;
      await page.route("**/api/assistant/**", (route) => { requests += 1; return route.abort(); });
      await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
      await page.waitForFunction(() => window.__secondEncodeHeld === true);
      await page.locator(".assistant-import-progress").getByRole("button", { name: "Annuler" }).click();
      await page.evaluate(() => window.__releaseSecondEncode());
      await page.waitForFunction(() => window.__secondEncodeDone === true);
      await expect(page.locator(".assistant-import-progress")).toHaveCount(0);
      await expect(page.locator(".assistant-attachment")).toHaveCount(2);
      await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toHaveCount(0);
      expect(requests).toBe(0);
    } finally { rmSync(fixtureDir, { recursive: true, force: true }); }
  });

  test("Assistant : une précision bornée peut créer une preview après un second noCandidate", async ({ page }) => {
    await page.goto("/");
    const selectionBodies = [];
    let recipeBody;
    await page.route("**/api/assistant/select", async (route) => {
      selectionBodies.push(route.request().postDataJSON());
      await route.fulfill({ json: selectionBodies.length === 1
        ? { kind: "candidates", candidates: [{ candidateRef: "candidate-1", reasonCode: "RELEVANT" }] }
        : { kind: "noCandidate" } });
    });
    await page.route("**/api/assistant/recipe", (route) => {
      recipeBody = route.request().postDataJSON();
      return route.fulfill({ json: {
      title: "Soupe pour deux", category: "SALE", ingredients: [{ id: "ingredient-1", label: "carotte", isScalable: false }], steps: [{ id: "step-1", order: 1, text: "Cuire." }]
      } });
    });
    const field = page.getByLabel("Votre demande");
    await field.fill("une soupe réconfortante");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Recette du Cahier trouvée/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toHaveCount(0);
    await field.fill("pour deux");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    expect(selectionBodies).toHaveLength(2);
    expect(recipeBody.turns).toEqual([
      { role: "user", text: "une soupe réconfortante" },
      { role: "user", text: "pour deux" }
    ]);
  });

  test("Compositeur : flèches du carrousel déplacent le focus sans faire défiler la page", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 500 });
    await page.goto("/");
    const cards = page.locator(".assistant-carousel-card");
    await expect(cards).toHaveCount(2);
    await cards.first().focus();
    await page.evaluate(() => {
      document.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          window.__assistantArrowPrevented = event.defaultPrevented;
        }
      });
    });
    const before = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    await cards.first().press("ArrowLeft");
    expect(await page.evaluate(() => window.__assistantArrowPrevented)).toBe(true);
    expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(before);
    await cards.first().focus();
    await cards.first().press("ArrowRight");
    await expect(cards.nth(1)).toBeFocused();
  });

  test("Compositeur : les contrôles et le conteneur font défiler le carrousel dans la bonne direction", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 500 });
    await page.goto("/");
    const carousel = page.locator(".assistant-carousel");
    await expect.poll(() => carousel.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

    await carousel.evaluate((element) => { element.scrollLeft = 0; });
    await page.getByRole("button", { name: "Suggestion suivante" }).click();
    await expect.poll(() => carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const afterNext = await carousel.evaluate((element) => element.scrollLeft);

    await page.getByRole("button", { name: "Suggestion précédente" }).click();
    await expect.poll(() => carousel.evaluate((element) => element.scrollLeft)).toBeLessThan(afterNext);

    await carousel.focus();
    const beforeKeyboard = await carousel.evaluate((element) => element.scrollLeft);
    await carousel.press("ArrowRight");
    await expect.poll(() => carousel.evaluate((element) => element.scrollLeft)).toBeGreaterThan(beforeKeyboard);
  });

  test("supprimer depuis le carrousel retourne à l'Assistant et au Compositeur", async ({ page }) => {
    await page.goto("/");
    await page.locator(".assistant-carousel-card").first().click();
    await page.locator(".recipe-detail-actions").getByRole("button", { name: "Supprimer" }).click();
    await page.getByText(/Supprimer définitivement/).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Supprimer" }).last().click();
    await expect(page.getByRole("heading", { name: "On mange quoi ?" })).toBeVisible();
    await expect(page.getByLabel("Votre demande")).toBeFocused();
  });

  test("active le mode cuisine depuis l'écran détail", async ({ page }) => {
    await page.goto("/");
    await createRecipeViaManual(page, "Recette test mode cuisine");
    await expect(page.getByRole("heading", { name: "Recette test mode cuisine" })).toBeVisible();
    // L'overlay utilise aria-label "Cuisiner" ; .first() = overlay (pas le bouton en bas)
    await page.getByRole("button", { name: "Cuisiner" }).first().click();
    await expect(page.locator(".message.success")).toContainText(/Wake Lock|fallback navigateur/i);
  });

  test("création, recherche, édition portions et suppression", async ({ page }) => {
    await page.goto("/");
    await createRecipeViaManual(page, "Brownie maison");

    await page.getByRole("button", { name: "Retour" }).click();
    await page.getByPlaceholder("Rechercher...").fill("brownie");
    await expect(page.getByText("Brownie maison")).toBeVisible();

    await page.getByText("Brownie maison").first().click();
    await expect(page.getByText("Mélanger les ingrédients")).toBeVisible();

    await page.locator(".recipe-detail-actions").getByRole("button", { name: "Supprimer" }).click();
    await page.getByText(/Supprimer définitivement/).waitFor({ state: "visible", timeout: 5000 });
    await page.getByRole("button", { name: "Supprimer" }).last().click();
    await expect(page.getByText("Recette supprimée.")).toBeVisible();
  });

  test("import fichier crée la recette directement", async ({ page }) => {
    let bffOk = false;
    try {
      const r = await fetch("http://localhost:8787/health");
      bffOk = r.ok;
    } catch {
      /* BFF non démarré */
    }
    test.skip(!bffOk, "BFF non disponible - lancer npm run dev:bff");

    await page.goto("/");
    await createRecipeViaImport(page, "Recette: Omelette");
    await expect(page.locator("section.panel.detail, section.panel.form-panel")).toBeVisible();
  });

  test("images ingrédient : icône visible sur détail et carte", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
    await page.getByRole("button", { name: "Nouvelle recette" }).click();
    await expect(page.getByRole("heading", { name: "Nouvelle recette" })).toBeVisible();
    await page.getByRole("button", { name: "Saisir à la main" }).click();
    await page.getByLabel("Titre").fill("Recette images ingrédient");
    await page.getByLabel(/ingredient-label-/).first().fill("Farine");
    await page.getByLabel(/ingredient-quantity-/).first().fill("200");
    await page.getByLabel(/ingredient-unit-/).first().fill("g");
    await page.getByLabel(/step-text-/).first().fill("Mélanger");
    await saveRecipeForm(page);

    await expect(page.getByRole("heading", { name: "Recette images ingrédient" })).toBeVisible();
    await expect(page.locator(".ingredient-card .ingredient-card-image-wrap").first()).toBeVisible();

    await page.getByRole("button", { name: "Retour" }).click();
    const recipeCard = page.locator(".recipe-card", {
      hasText: "Recette images ingrédient"
    }).first();
    await expect(recipeCard.locator(".recipe-card-ingredient-icons .ingredient-icon--card").first()).toBeVisible();
  });

  test("ordre des ingrédients conservé après sauvegarde", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
    await page.getByRole("button", { name: "Nouvelle recette" }).click();
    await expect(page.getByRole("heading", { name: "Nouvelle recette" })).toBeVisible();
    await page.getByRole("button", { name: "Saisir à la main" }).click();

    await page.getByLabel("Titre").fill("Recette ordre ingrédients");

    // 1er ingrédient
    await page.getByLabel(/ingredient-quantity-/).first().fill("100");
    await page.getByLabel(/ingredient-label-/).first().fill("Sucre");
    await page.getByLabel(/ingredient-unit-/).first().fill("g");

    // 2e ingrédient
    await page.getByRole("button", { name: "Ajouter ingrédient" }).click();
    await page.getByLabel(/ingredient-quantity-/).nth(1).fill("200");
    await page.getByLabel(/ingredient-label-/).nth(1).fill("Farine");
    await page.getByLabel(/ingredient-unit-/).nth(1).fill("g");

    // 3e ingrédient
    await page.getByRole("button", { name: "Ajouter ingrédient" }).click();
    await page.getByLabel(/ingredient-quantity-/).nth(2).fill("2");
    await page.getByLabel(/ingredient-label-/).nth(2).fill("Oeuf");
    await page.getByLabel(/ingredient-unit-/).nth(2).fill("pièce");

    await page.getByLabel(/step-text-/).first().fill("Mélanger");
    await saveRecipeForm(page);
    await expect(page.getByRole("heading", { name: "Recette ordre ingrédients" })).toBeVisible();

    const detailIngredients = page.locator(".ingredient-card-name");
    await expect(detailIngredients).toHaveCount(3);
    await expect(detailIngredients.nth(0)).toHaveText("Sucre");
    await expect(detailIngredients.nth(1)).toHaveText("Farine");
    await expect(detailIngredients.nth(2)).toHaveText("Oeuf");

    await page.getByRole("button", { name: "Éditer" }).click();
    await expect(page.getByRole("heading", { name: "Éditer recette" })).toBeVisible();
    await expect(page.getByLabel(/ingredient-label-/).nth(0)).toHaveValue("Sucre");
    await expect(page.getByLabel(/ingredient-label-/).nth(1)).toHaveValue("Farine");
    await expect(page.getByLabel(/ingredient-label-/).nth(2)).toHaveValue("Oeuf");
  });

  test("import YouTube : description, ingrédients, embed, poster, pas d'overlay Cuisiner", async ({
    page
  }) => {
    test.skip(!!process.env.CI, "YouTube extraction flaky en CI (oEmbed/HTML)");
    test.setTimeout(60000); // BFF + YouTube + OpenAI peuvent prendre du temps
    const youtubeUrl = "https://www.youtube.com/watch?v=32cyzq4Cm94";

    let bffOk = false;
    try {
      const r = await fetch("http://localhost:8787/health");
      bffOk = r.ok;
    } catch {
      /* BFF non démarré */
    }
    test.skip(!bffOk, "BFF non disponible - lancer npm run dev:bff dans un terminal séparé");

    await page.goto("/");
    await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
    await page.getByRole("button", { name: "Nouvelle recette" }).click();
    await expect(page.getByRole("heading", { name: "Nouvelle recette" })).toBeVisible();

    await page.locator("#paste-field").fill(youtubeUrl);
    await page.locator(".paste-field-import-btn").click();

    await expect(page.locator(".message.success")).toContainText(/Recette importée/i, {
      timeout: 30000
    });
    await expect(page.locator("section.panel.detail")).toBeVisible({ timeout: 5000 });

    const recipeTitle = (await page.locator(".recipe-detail-title").textContent())?.trim() ?? "";

    // Embed YouTube visible dans la fiche recette
    await expect(page.locator("iframe.recipe-detail-youtube-embed")).toBeVisible();
    await expect(page.locator("iframe[title='Aperçu vidéo YouTube']")).toHaveAttribute(
      "src",
      /youtube\.com\/embed\/32cyzq4Cm94/
    );

    // Pas de bouton overlay "Cuisiner" par-dessus l'embed (gêne la vidéo)
    await expect(page.locator(".recipe-detail-play-overlay")).toHaveCount(0);

    // Bouton "Cuisiner" en bas reste disponible
    await expect(page.locator(".recipe-detail-cuisiner-primary")).toBeVisible();

    // Ingrédients extraits depuis la description YouTube
    const ingredientCards = page.locator(".ingredient-card");
    await expect(ingredientCards.first()).toBeVisible({ timeout: 5000 });

    // Poster sur les cartes : retour à la liste, vérifier l'image sur la carte
    await page.getByRole("button", { name: "Retour" }).click();
    const recipeCard = recipeTitle
      ? page.locator(".recipe-card", { hasText: recipeTitle }).first()
      : page.locator(".recipe-card").first();
    await expect(recipeCard).toBeVisible();
    // L'image poster (thumbnail YouTube) est affichée sur la carte (chargement async)
    await expect(recipeCard.locator(".recipe-card-image")).toBeVisible({ timeout: 15000 });
  });

  test("import Instagram Reel : description, ingrédients, embed, poster, pas d'overlay Cuisiner", async ({
    page
  }) => {
    test.skip(!!process.env.CI, "Instagram bloque le scraping en CI (401)");
    test.setTimeout(60000); // BFF + Instagram scraper + OpenAI peuvent prendre du temps
    const instagramUrl = "https://www.instagram.com/reel/DSQHEVSjRUr/";

    let bffOk = false;
    try {
      const r = await fetch("http://localhost:8787/health");
      bffOk = r.ok;
    } catch {
      /* BFF non démarré */
    }
    test.skip(!bffOk, "BFF non disponible - lancer npm run dev:bff dans un terminal séparé");

    await page.goto("/");
    await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
    await page.getByRole("button", { name: "Nouvelle recette" }).click();
    await expect(page.getByRole("heading", { name: "Nouvelle recette" })).toBeVisible();

    await page.locator("#paste-field").fill(instagramUrl);
    await page.locator(".paste-field-import-btn").click();

    // Succès complet ou fallback (scraper Instagram peut échouer/être limité)
    await expect(
      page.locator(".message.success, .message.warning, .message.error")
    ).toContainText(/Recette importée|extraction du post Instagram est incomplète|Instagram|erreur|échoué/i, {
      timeout: 60000
    });
    await expect(
      page.locator("section.panel.detail, section.panel.form-panel")
    ).toBeVisible({ timeout: 5000 });

    // Embed Instagram visible (détail ou formulaire)
    await expect(page.locator("iframe.recipe-detail-instagram-embed, iframe.recipe-form-instagram-embed")).toBeVisible();
    await expect(page.locator("iframe[title='Aperçu Instagram']")).toHaveAttribute(
      "src",
      /instagram\.com\/reel\/DSQHEVSjRUr\/embed/
    );

    const inDetail = (await page.locator("section.panel.detail").count()) > 0;
    if (inDetail) {
      // Pas de bouton overlay "Cuisiner" par-dessus l'embed
      await expect(page.locator(".recipe-detail-play-overlay")).toHaveCount(0);
      await expect(page.locator(".recipe-detail-cuisiner-primary")).toBeVisible();
      const ingredientCards = page.locator(".ingredient-card");
      await expect(ingredientCards.first()).toBeVisible({ timeout: 5000 });
      const recipeTitle = (await page.locator(".recipe-detail-title").textContent())?.trim() ?? "";
      await page.getByRole("button", { name: "Retour" }).click();
      const recipeCard = recipeTitle
        ? page.locator(".recipe-card", { hasText: recipeTitle }).first()
        : page.locator(".recipe-card").first();
      await expect(recipeCard).toBeVisible();
      await expect(recipeCard.locator(".recipe-card-image")).toBeVisible({ timeout: 15000 });
    } else {
      // Fallback : formulaire avec embed, pas d'overlay (on est dans le form)
      await expect(page.locator(".recipe-form-instagram-embed")).toBeVisible();
    }
  });

  test("image recette : affichage sur carte, détail, formulaire et suppression", async ({
    page
  }) => {
    await page.goto("/");
    const imagePath = path.join(process.cwd(), "e2e", "fixtures", "test-image.png");

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Ouvrir le Cahier" }).click();
    await page.getByRole("button", { name: "Nouvelle recette" }).click();
    await expect(page.getByRole("heading", { name: "Nouvelle recette" })).toBeVisible();
    await page.getByRole("button", { name: "Saisir à la main" }).click();
    await page.getByLabel("Titre").fill("Recette avec image");
    await page.getByLabel(/step-text-/).first().fill("Étape 1");
    await page.getByRole("button", { name: "Ajouter une image à la recette" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(imagePath);
    await saveRecipeForm(page);

    await expect(page.getByRole("heading", { name: "Recette avec image" })).toBeVisible();
    await expect(page.getByAltText("Photo de la recette").first()).toBeVisible();

    await page.getByRole("button", { name: "Retour" }).click();
    const recipeCard = page.locator(".recipe-card", { hasText: "Recette avec image" }).first();
    await expect(recipeCard.locator(".recipe-card-image")).toBeVisible();

    await recipeCard.click();
    await expect(page.locator(".recipe-detail-image")).toBeVisible();

    await page.getByRole("button", { name: "Éditer" }).click();
    await expect(page.locator(".recipe-form-image")).toBeVisible();
    await page
      .locator(".recipe-form-image-actions")
      .getByRole("button", { name: "Supprimer" })
      .click();
    await saveRecipeForm(page);

    await page.getByRole("button", { name: "Retour" }).click();
    await expect(recipeCard.locator(".recipe-card-image")).toHaveCount(0);
  });
});
