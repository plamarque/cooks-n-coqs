import { expect, test } from "@playwright/test";

const CAP7_INVALID_MESSAGE = "Ce lien de partage n'est pas valide.";
const CAP7_UNAVAILABLE_MESSAGE = "Ce partage n'est plus disponible — redemande à Alice";
const MODE_A_SOURCE = "https://example.com/recette-proximite-e2e-tarte";
/** URL source seed Coquillettes (`apps/web/src/seed/initial-recipes.ts`). */
const COQUILLETTES_SEED_SOURCE_URL =
  "https://cuisine.journaldesfemmes.fr/recette/3090629-coquillettes-au-jambon-de-juan-arbelaez";

/** Draft minimal valide pour mock `/api/import/url` (évite OpenAI). */
const MOCK_IMPORT_DRAFT = {
  title: "Tarte e2e proximité",
  category: "SUCRE",
  ingredients: [{ order: 1, label: "Farine", quantity: 200, unit: "g", isScalable: true }],
  steps: [{ order: 1, text: "Mélanger et enfourner." }],
  source: {
    type: "URL",
    url: MODE_A_SOURCE,
    capturedAt: "2026-01-01T00:00:00.000Z"
  }
};

/** Envelope Mode B minimale pour POST create drop (corps ticket réel). */
const MODE_B_DROP_PAYLOAD = {
  title: "Cookies e2e Mode B",
  category: "SUCRE",
  ingredients: [{ order: 1, label: "Chocolat", quantity: 100, unit: "g", isScalable: true }],
  steps: [{ order: 1, text: "Former des boules." }]
};

async function assertBff() {
  let bffOk = false;
  try {
    const r = await fetch("http://localhost:8787/health", {
      signal: AbortSignal.timeout(3000)
    });
    bffOk = r.ok;
  } catch {
    /* BFF non démarré ou timeout */
  }
  test.skip(!bffOk, "BFF non disponible - lancer npm run dev:bff");

  // Sonde non destructive : GET ticket inexistant → 404/410 + reason JSON si la route existe.
  let dropRouteOk = false;
  try {
    const probe = await fetch(
      "http://localhost:8787/api/proximity-drop/__e2e-probe-missing__",
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3000)
      }
    );
    if (probe.status === 404 || probe.status === 410) {
      const body = await probe.json().catch(() => null);
      dropRouteOk =
        Boolean(body) &&
        typeof body === "object" &&
        typeof body.reason === "string";
    }
  } catch {
    dropRouteOk = false;
  }
  test.skip(
    !dropRouteOk,
    "BFF sans routes proximity-drop (rebuild/restart BFF) — /health OK mais drop indisponible"
  );
}

async function forceStandaloneDisplayMode(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (q) => ({
        matches: String(q).includes("display-mode: standalone"),
        media: q,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        }
      })
    });
  });
}

async function mockImportUrlOk(page) {
  await page.route("**/api/import**", async (route) => {
    const url = route.request().url();
    if (!url.includes("/api/import/url") && !url.includes("/api/import?")) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_IMPORT_DRAFT)
    });
  });
}

/**
 * Capture m/t construits par ProximityTransfer (searchParams) —
 * le QR n’expose pas l’URL en texte dans le DOM.
 */
async function installProximityDeepLinkProbe(page) {
  await page.addInitScript(() => {
    window.__e2eProximityDeepLink = null;
    const origSet = URLSearchParams.prototype.set;
    URLSearchParams.prototype.set = function setProxied(key, value) {
      origSet.call(this, key, value);
      const mode = this.get("m");
      if (mode === "a" || mode === "b") {
        const params = new URLSearchParams(this.toString());
        window.__e2eProximityDeepLink = {
          m: mode,
          u: params.get("u"),
          t: params.get("t"),
          title: params.get("title"),
          search: params.toString()
        };
      }
    };
  });
}

async function readCapturedProximityDeepLink(page) {
  return page.evaluate(() => window.__e2eProximityDeepLink);
}

test.describe("Câblage App.vue proximité", () => {
  test("bootstrap Mode A hors standalone → overlay install (DW-2, DW-7)", async ({ page }) => {
    const u = encodeURIComponent(MODE_A_SOURCE);
    await page.goto(`/r?m=a&u=${u}&title=Tarte`);

    await expect(page.locator(".proximity-receive-install-dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Installer Cookies/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuer vers la recette" })).toBeVisible();
    await expect(page.locator(".message.error")).toHaveCount(0);
    await expect(page.locator(".proximity-receive-confirm-dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Continuer vers la recette" }).click();
    await expect(page.locator(".proximity-receive-confirm-dialog")).toBeVisible();
  });

  test("Partager Mode A (seed Coquillettes) → overlay QR (DW-3)", async ({ page }) => {
    await installProximityDeepLinkProbe(page);
    await page.goto("/");
    await page.getByText("Coquillettes au jambon de Juan Arbelaez").click();
    await expect(
      page.getByRole("heading", { name: "Coquillettes au jambon de Juan Arbelaez" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Partager cette recette" }).click();

    await expect(page.locator(".proximity-qr-share-dialog")).toBeVisible();
    await expect(page.getByRole("img", { name: "QR de partage proximité" })).toBeVisible();

    const captured = await readCapturedProximityDeepLink(page);
    expect(captured?.m).toBe("a");
    expect(captured?.u).toBe(COQUILLETTES_SEED_SOURCE_URL);
  });

  test("Partager Mode B (Cookies sans URL) → QR m=b&t= (DW-11a)", async ({ page }) => {
    await assertBff();
    await installProximityDeepLinkProbe(page);

    await page.goto("/");
    await page.getByText("Cookies aux pépites de chocolat").click();
    await expect(
      page.getByRole("heading", { name: "Cookies aux pépites de chocolat" })
    ).toBeVisible();

    const dropResponsePromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/proximity-drop") &&
        r.request().method() === "POST" &&
        !r.url().match(/\/api\/proximity-drop\/[^/]+$/)
    );
    await page.getByRole("button", { name: "Partager cette recette" }).click();
    let dropResponse;
    try {
      dropResponse = await dropResponsePromise;
    } catch (waitError) {
      const banner = page.locator(".message.error");
      if (await banner.count()) {
        throw new Error(
          `Partage Mode B: ${(await banner.innerText()).trim()} (pas de réponse POST drop)`
        );
      }
      throw waitError;
    }
    expect(dropResponse.status()).toBe(201);
    const { id: ticketId } = await dropResponse.json();
    expect(ticketId).toBeTruthy();

    await expect(page.locator(".proximity-qr-share-dialog")).toBeVisible();
    await expect(page.getByRole("img", { name: "QR de partage proximité" })).toBeVisible();

    const captured = await readCapturedProximityDeepLink(page);
    expect(captured?.m).toBe("b");
    expect(captured?.t).toBe(ticketId);
  });

  test("CAP-7 bootstrap deep link invalide → bannière erreur (DW-14)", async ({ page }) => {
    await page.goto("/r?m=z");

    await expect(page.locator(".message.error")).toContainText(CAP7_INVALID_MESSAGE);
    await expect(page.locator(".proximity-receive-confirm-dialog")).toHaveCount(0);
    await expect(page.locator(".proximity-receive-install-dialog")).toHaveCount(0);
  });

  test("Confirmer Mode A standalone + mock import → succès (DW-9)", async ({ page }) => {
    await forceStandaloneDisplayMode(page);
    await mockImportUrlOk(page);

    const u = encodeURIComponent(MODE_A_SOURCE);
    await page.goto(`/r?m=a&u=${u}&title=Tarte`);

    await expect(page.locator(".proximity-receive-confirm-dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tarte" })).toBeVisible();

    const importRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/api/import") && req.method() === "POST"
    );
    await page.getByRole("button", { name: "Confirmer" }).click();
    const importRequest = await importRequestPromise;
    expect(importRequest.postDataJSON()?.url).toBe(MODE_A_SOURCE);

    await expect(page.locator(".message.success")).toContainText(/Recette importée/i, {
      timeout: 15000
    });
    await expect(page.locator("section.panel.detail")).toBeVisible();
  });

  test("Confirmer Mode B standalone + drop BFF → import (DW-11b)", async ({ page }) => {
    await assertBff();

    let createRes;
    try {
      createRes = await fetch("http://localhost:8787/api/proximity-drop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(MODE_B_DROP_PAYLOAD),
        signal: AbortSignal.timeout(3000)
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      test.skip(true, `POST proximity-drop inaccessible (${detail}) — BFF down/timeout`);
    }
    expect(createRes.status).toBe(201);
    const { id: ticketId } = await createRes.json();
    expect(ticketId).toBeTruthy();

    await forceStandaloneDisplayMode(page);
    await page.goto(`/r?m=b&t=${encodeURIComponent(ticketId)}&title=${encodeURIComponent(MODE_B_DROP_PAYLOAD.title)}`);

    await expect(page.locator(".proximity-receive-confirm-dialog")).toBeVisible();
    await page.getByRole("button", { name: "Confirmer" }).click();

    await expect(page.locator(".message.success")).toContainText(/Recette importée/i, {
      timeout: 15000
    });
    await expect(page.locator(".recipe-detail-title")).toHaveText(MODE_B_DROP_PAYLOAD.title);
  });

  test("CAP-7 Confirmer ticket mort → bannière indisponible (DW-14)", async ({ page }) => {
    await forceStandaloneDisplayMode(page);

    await page.route("**/api/proximity-drop/**", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ reason: "not_found", error: "not found" })
      });
    });

    await page.goto("/r?m=b&t=ticket-e2e-mort&title=Fantome");

    await expect(page.locator(".proximity-receive-confirm-dialog")).toBeVisible();
    await page.getByRole("button", { name: "Confirmer" }).click();

    await expect(page.locator(".message.error")).toContainText(CAP7_UNAVAILABLE_MESSAGE);
    await expect(page.locator(".message.success")).toHaveCount(0);
    await expect(page.locator("section.panel.detail")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Fantome" })).toHaveCount(0);
  });
});
