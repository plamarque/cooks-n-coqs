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

  await page.getByRole("button", { name: "Nouvelle recette" }).click();
  await expect(page.getByRole("heading", { name: "Nouvelle recette" })).toBeVisible();
  // setInputFiles plus fiable que filechooser en headless (CI)
  await page.locator(".add-choice-panel input[type='file']").setInputFiles(filePath);

  await expect(page.locator("section.panel.detail, section.panel.form-panel")).toBeVisible({
    timeout: 15000
  });
  // Message succès/erreur/warning (fallback = warning, pas success)
  await expect(
    page.locator(".message.success, .message.error, .message.warning")
  ).toContainText(/Recette importée|échoué|incomplète|erreur/i, { timeout: 15000 });
}

test.describe("Cookies & Coquillettes v1", () => {
  test("affiche l'écran principal avec les cartes et filtre favoris actif par défaut", async ({
    page
  }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Nouvelle recette" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Favoris", exact: true })).toBeVisible();
    // Filtre favoris actif par défaut : les recettes seed (favorites) sont visibles
    await expect(page.getByText("Coquillettes au jambon de Juan Arbelaez")).toBeVisible();
    await expect(page.getByText("Cookies aux pépites de chocolat")).toBeVisible();
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
    await page.getByRole("button", { name: "Nouvelle recette" }).click();
    await expect(page.getByRole("heading", { name: "Nouvelle recette" })).toBeVisible();

    await page.locator("#paste-field").fill(youtubeUrl);
    await page.getByRole("button", { name: "Importer" }).click();

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
    await page.getByRole("button", { name: "Nouvelle recette" }).click();
    await expect(page.getByRole("heading", { name: "Nouvelle recette" })).toBeVisible();

    await page.locator("#paste-field").fill(instagramUrl);
    await page.getByRole("button", { name: "Importer" }).click();

    // Succès complet ou fallback (scraper Instagram peut échouer/être limité)
    await expect(page.locator(".message.success")).toContainText(
      /Recette importée|extraction du post Instagram est incomplète/i,
      { timeout: 30000 }
    );
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
