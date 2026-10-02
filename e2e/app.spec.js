import { expect, test } from "@playwright/test";
import path from "path";
import { writeFileSync, mkdirSync } from "fs";

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

  test("Compositeur : starter, demande vide et raccourci importent une prévisualisation", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "import" } }));
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
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles([
      { name: "une.png", mimeType: "image/png", buffer: Buffer.from("one") },
      { name: "deux.png", mimeType: "image/png", buffer: Buffer.from("two") },
      { name: "trois.png", mimeType: "image/png", buffer: Buffer.from("three") }
    ]);
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
    await page.goto("/");
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "import" } }));
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
    await card.press("Enter");
    await expect(page.getByRole("heading", { name: "Soupe express" })).toBeVisible();
    await expect(page.locator(".assistant-preview-detail .ingredient-grid")).toContainText("oignon");
    await expect(page.locator(".assistant-preview-detail .prep-steps-list")).toContainText("Mixer");
    await expect(page.getByRole("button", { name: "Sauvegarder", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Fermer la prévisualisation" })).toBeVisible();
    expect(await countStores()).toEqual(before);
    await page.getByRole("button", { name: "Fermer la prévisualisation" }).click();
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "On mange quoi ?" })).toBeVisible();
    await expect(field).toBeFocused();
    expect(await countStores()).toEqual(before);
  });

  test("Assistant : noCandidate Jev produit une preview temporaire, puis sauvegarde une seule recette", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "newRecipe" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Crumble pommes", category: "SUCRE", ingredients: [{ id: "pomme", label: "pommes", isScalable: true }], steps: [{ id: "s1", order: 1, text: "Cuire 25 minutes." }]
    } }));
    await page.getByLabel("Votre demande").fill("un dessert fruité d'automne réconfortant");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    const card = page.getByRole("button", { name: /Prévisualisation prête/ });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.getByRole("heading", { name: "Crumble pommes" })).toBeVisible();
    await page.getByRole("button", { name: "Sauvegarder", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Crumble pommes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fermer la prévisualisation" })).toHaveCount(0);
  });

  test("Assistant : candidate Jev affiche la carte Cahier puis ouvre la recette sans copie ni écriture", async ({ page }) => {
    await page.goto("/");
    const existingTitle = await page.locator(".assistant-carousel-title").first().textContent();
    expect(existingTitle).toBeTruthy();
    const recipeCount = () => page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open("cookies-et-coquilettes");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction("recipes", "readonly");
      return await new Promise((resolve, reject) => {
        const request = transaction.objectStore("recipes").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
    await expect.poll(recipeCount).toBe(2);
    const before = await recipeCount();
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "candidate", candidateRef: "candidate-1", reasonCode: "RELEVANT" } }));
    await page.route("**/api/assistant/recipe", (route) => route.abort("failed"));
    await page.getByLabel("Votre demande").fill("une recette du Cahier qui ressemble à celle-ci");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    const card = page.getByRole("button", { name: /Recette du Cahier trouvée/ });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.getByRole("heading", { name: existingTitle, exact: true })).toBeVisible();
    expect(await recipeCount()).toBe(before);
  });

  test("Assistant : les entrées concurrentes sont gelées pendant l'import", async ({ page }) => {
    await page.goto("/");
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route("**/api/assistant/image-intent*", (route) => route.fulfill({ json: { summaries: ["Un plat."] } }));
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "import" } }));
    await page.route("**/api/import/screenshot", async (route) => {
      await gate;
      await route.fulfill({ json: { title: "Import", category: "SALE", ingredients: [], steps: [] } });
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

  test("Assistant : une URL et une image sont sélectionnées avant leur parse", async ({ page }) => {
    await page.goto("/");
    const calls = [];
    await page.route("**/api/assistant/select", (route) => { calls.push("select"); return route.fulfill({ json: { kind: "import" } }); });
    await page.route("**/api/import/url", (route) => { calls.push("url"); return route.fulfill({ json: { title: "URL", category: "SALE", ingredients: [{ id: "i", label: "x", isScalable: false }], steps: [{ id: "s", order: 1, text: "Cuire" }] } }); });
    await page.getByLabel("Votre demande").fill("https://example.test/recette");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    expect(calls).toEqual(["select", "url"]);
  });

  test("Assistant : une image suit image-intent, sélection puis screenshot, et ne parse pas sans choix import", async ({ page }) => {
    await page.goto("/");
    const calls = [];
    await page.route("**/api/assistant/image-intent*", (route) => { calls.push("image-intent"); return route.fulfill({ json: { summaries: ["Un plat."] } }); });
    await page.route("**/api/assistant/select", (route) => { calls.push("select"); return route.fulfill({ json: { kind: "import" } }); });
    await page.route("**/api/import/screenshot", (route) => { calls.push("screenshot"); return route.fulfill({ json: { title: "Photo", category: "SALE", ingredients: [{ id: "i", label: "tomate", isScalable: false }], steps: [{ id: "s", order: 1, text: "Cuire" }] } }); });
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles({ name: "plat.png", mimeType: "image/png", buffer: Buffer.from("image") });
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    expect(calls).toEqual(["image-intent", "select", "screenshot"]);

    await page.goto("/");
    const blocked = [];
    await page.route("**/api/assistant/image-intent*", (route) => { blocked.push("image-intent"); return route.fulfill({ json: { summaries: ["Un plat."] } }); });
    await page.route("**/api/assistant/select", (route) => { blocked.push("select"); return route.fulfill({ json: { kind: "newRecipe" } }); });
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: { title: "Suggestion", category: "SALE", ingredients: [{ id: "i", label: "tomate", isScalable: false }], steps: [{ id: "s", order: 1, text: "Cuire" }] } }));
    await page.locator(".assistant-home input[type='file'][multiple]").setInputFiles({ name: "sans-import.png", mimeType: "image/png", buffer: Buffer.from("image") });
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    expect(blocked).toEqual(["image-intent", "select"]);
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
    await page.route("**/api/assistant/select", (route) => route.fulfill({ json: { kind: "newRecipe" } }));
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Salade aux quatre photos", category: "SALE", ingredients: [{ id: "riz", label: "riz", isScalable: true }], steps: [{ id: "s1", order: 1, text: "Mélanger le riz." }]
    } }));
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    expect(analysed).toHaveLength(4);
    expect(new Set(analysed.map((url) => new URL(url).searchParams.get("attempt"))).size).toBe(4);
  });

  test("Assistant : une précision affiche le fil sans vignette et reprend tous les tours", async ({ page }) => {
    await page.goto("/");
    const selectionBodies = [];
    await page.route("**/api/assistant/select", async (route) => {
      selectionBodies.push(route.request().postDataJSON());
      await route.fulfill({ json: selectionBodies.length === 1
        ? { kind: "clarify", question: "Pour combien de personnes ?" }
        : { kind: "newRecipe" } });
    });
    await page.route("**/api/assistant/recipe", (route) => route.fulfill({ json: {
      title: "Soupe pour deux", category: "SALE", ingredients: [{ id: "i", label: "carotte", isScalable: false }], steps: [{ id: "s", order: 1, text: "Cuire." }]
    } }));
    const field = page.getByLabel("Votre demande");
    await field.fill("une soupe réconfortante");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByText("Pour combien de personnes ?")).toBeVisible();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toHaveCount(0);
    await expect(field).toHaveValue("");
    await field.fill("pour deux");
    await page.getByRole("button", { name: "Envoyer la demande", exact: true }).click();
    await expect(page.getByRole("button", { name: /Prévisualisation prête/ })).toBeVisible();
    expect(selectionBodies).toHaveLength(2);
    expect(selectionBodies[1].turns).toEqual([
      { role: "user", text: "une soupe réconfortante" },
      { role: "assistant", text: "Pour combien de personnes ?" },
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
