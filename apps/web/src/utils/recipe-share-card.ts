/**
 * Image illustrative partage locale (~1080×1080) — seam `recipe-share-card`.
 * Photo plein cadre (ou placeholder sage) + CTA visuel bas + favicon overlay haut-droite.
 * Pas de fiche (titre / portions / ingrédients) ni faux chrome UI.
 */

import type { Recipe } from "@cookies-et-coquilettes/domain";
import { formatShareServingsLine } from "./recipe-share-f2";

export const RECIPE_SHARE_CARD_SIZE = 1080;
/** Hauteur du bandeau CTA bas (~18 % du carré). */
export const RECIPE_SHARE_CARD_CTA_RATIO = 0.18;
/** Logo ~10 % de la largeur card. */
export const RECIPE_SHARE_CARD_LOGO_RATIO = 0.1;

/** Microcopy CTA visuel — même intention que la ligne texte F2, sans URL. */
export const RECIPE_SHARE_CARD_CTA_LABEL = "Tu veux garder cette recette ?";

export const RECIPE_SHARE_CARD_COLORS = {
  cream: "#f8f4ec",
  primary: "#1f4f46",
  placeholder: "rgba(31, 79, 70, 0.08)",
  ctaBand: "rgba(31, 79, 70, 0.88)",
  ctaText: "#f8f4ec"
} as const;

/** Alias compat — portions pour le wire F2 (voir `formatShareServingsLine`). */
export const formatShareCardServings = formatShareServingsLine;

const FONT_STACK = '"Manrope", "Avenir Next", "Segoe UI", sans-serif';
/** Timeout média (Image / toBlob) — évite nativeShareBusy bloqué. */
const RECIPE_SHARE_CARD_MEDIA_TIMEOUT_MS = 10_000;
/** Budget global génération card (photo + logo + toBlob sérialisés). */
const RECIPE_SHARE_CARD_BUILD_TIMEOUT_MS = 12_000;

/** Chaînes interdites sur l’image illustrative (faux chrome). */
export const RECIPE_SHARE_CARD_FORBIDDEN_CHROME = [
  "Cuisiner",
  "Retour",
  "♥",
  "❤",
  "favorite",
  "pi-heart",
  "pi-arrow"
] as const;

export type RecipeShareCardLayout = {
  size: number;
  /** Zone photo = plein cadre. */
  photoHeight: number;
  cta: { y: number; height: number; label: string };
  hasPhoto: boolean;
  logo: { x: number; y: number; size: number };
  padding: number;
};

export type BuildRecipeShareCardDeps = {
  /** Charge une image same-origin ou blob pour `drawImage`. */
  loadImage?: (source: string | Blob) => Promise<CanvasImageSource>;
  createCanvas?: (width: number, height: number) => {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  };
  toBlob?: (
    canvas: HTMLCanvasElement | OffscreenCanvas,
    type: string
  ) => Promise<Blob | null>;
};

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/** Plan de layout (testable sans canvas). */
export function planRecipeShareCardLayout(
  _recipe: Recipe,
  options?: { hasPhoto?: boolean }
): RecipeShareCardLayout {
  const size = RECIPE_SHARE_CARD_SIZE;
  const padding = Math.round(size * 0.056);
  const logoSize = Math.round(size * RECIPE_SHARE_CARD_LOGO_RATIO);
  const logoMargin = Math.round(size * 0.028);
  const ctaHeight = Math.round(size * RECIPE_SHARE_CARD_CTA_RATIO);

  return {
    size,
    photoHeight: size,
    cta: {
      y: size - ctaHeight,
      height: ctaHeight,
      label: RECIPE_SHARE_CARD_CTA_LABEL
    },
    hasPhoto: Boolean(options?.hasPhoto),
    logo: {
      x: size - logoMargin - logoSize,
      y: logoMargin,
      size: logoSize
    },
    padding
  };
}

/** Vérifie qu’aucune chaîne de faux chrome n’apparaît dans le layout texte. */
export function layoutContainsForbiddenChrome(layout: RecipeShareCardLayout): boolean {
  const haystack = layout.cta.label.toLowerCase();
  return RECIPE_SHARE_CARD_FORBIDDEN_CHROME.some((token) =>
    haystack.includes(token.toLowerCase())
  );
}

function defaultCreateCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  if (typeof document === "undefined") {
    throw new Error("Canvas indisponible (pas de document).");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Contexte 2D indisponible.");
  }
  return { canvas, ctx };
}

async function defaultToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string
): Promise<Blob | null> {
  const run = async (): Promise<Blob | null> => {
    if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
      return canvas.convertToBlob({ type });
    }
    const htmlCanvas = canvas as HTMLCanvasElement;
    return new Promise((resolve) => {
      htmlCanvas.toBlob((blob) => resolve(blob), type);
    });
  };
  try {
    return await withTimeout(
      run(),
      RECIPE_SHARE_CARD_MEDIA_TIMEOUT_MS,
      "toBlob timeout"
    );
  } catch {
    return null;
  }
}

function loadImageViaElement(source: string | Blob): Promise<HTMLImageElement> {
  let objectUrl: string | undefined;
  let img: HTMLImageElement | undefined;
  const load = new Promise<HTMLImageElement>((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(new Error("Image indisponible."));
      return;
    }
    img = new Image();
    img.decoding = "async";
    objectUrl = typeof source === "string" ? undefined : URL.createObjectURL(source);
    img.onload = () => {
      // Révoquer après paint : l’image décodée reste utilisable pour drawImage.
      if (objectUrl) {
        const url = objectUrl;
        objectUrl = undefined;
        queueMicrotask(() => URL.revokeObjectURL(url));
      }
      resolve(img!);
    };
    img.onerror = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = undefined;
      }
      reject(new Error("Chargement image échoué."));
    };
    img.src = objectUrl ?? (source as string);
  });
  return withTimeout(load, RECIPE_SHARE_CARD_MEDIA_TIMEOUT_MS, "loadImage timeout").catch(
    (error) => {
      if (img) {
        img.onload = null;
        img.onerror = null;
        img.src = "";
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = undefined;
      }
      throw error;
    }
  );
}

async function resolvePhotoBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  const createBitmap = globalThis.createImageBitmap?.bind(globalThis);
  if (typeof createBitmap === "function") {
    try {
      return await withTimeout(
        createBitmap(blob),
        RECIPE_SHARE_CARD_MEDIA_TIMEOUT_MS,
        "createImageBitmap timeout"
      );
    } catch {
      // SVG / formats exotiques / timeout : retomber sur Image.
    }
  }
  return loadImageViaElement(blob);
}

function getImageSourceSize(source: CanvasImageSource): { width: number; height: number } {
  const naturalW =
    "naturalWidth" in source ? Number((source as HTMLImageElement).naturalWidth) : NaN;
  const naturalH =
    "naturalHeight" in source ? Number((source as HTMLImageElement).naturalHeight) : NaN;
  if (Number.isFinite(naturalW) && naturalW > 0 && Number.isFinite(naturalH) && naturalH > 0) {
    return { width: naturalW, height: naturalH };
  }
  const w = "width" in source ? Number((source as ImageBitmap).width) : NaN;
  const h = "height" in source ? Number((source as ImageBitmap).height) : NaN;
  return {
    width: Number.isFinite(w) && w > 0 ? w : 0,
    height: Number.isFinite(h) && h > 0 ? h : 0
  };
}

function drawCover(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  dx: number,
  dy: number,
  dw: number,
  dh: number
): boolean {
  const { width: sw, height: sh } = getImageSourceSize(source);
  if (!sw || !sh) {
    return false;
  }
  const scale = Math.max(dw / sw, dh / sh);
  const tw = sw * scale;
  const th = sh * scale;
  const ox = dx + (dw - tw) / 2;
  const oy = dy + (dh - th) / 2;
  ctx.drawImage(source, ox, oy, tw, th);
  return true;
}

function drawPlaceholderPhoto(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: RecipeShareCardLayout
): void {
  ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.cream;
  ctx.fillRect(0, 0, layout.size, layout.photoHeight);
  ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.placeholder;
  ctx.fillRect(0, 0, layout.size, layout.photoHeight);
  ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.primary;
  ctx.globalAlpha = 0.12;
  const cx = layout.size / 2;
  const cy = layout.size / 2;
  ctx.beginPath();
  ctx.arc(cx, cy - 24, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawCtaBand(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: RecipeShareCardLayout
): void {
  const { y, height, label } = layout.cta;
  ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.ctaBand;
  ctx.fillRect(0, y, layout.size, height);

  const textWidth = layout.size - layout.padding * 2;
  ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.ctaText;
  ctx.font = `700 42px ${FONT_STACK}`;
  ctx.textBaseline = "middle";
  const display =
    ctx.measureText(label).width <= textWidth
      ? label
      : truncateToWidth(ctx, label, textWidth);
  ctx.fillText(display, layout.padding, y + height / 2);
}

/**
 * Génère un PNG File pour le Web Share. Retourne `null` si canvas / blob KO
 * (l’appelant dégrade au texte seul).
 */
export async function buildRecipeShareCardFile(
  recipe: Recipe,
  options?: {
    /** Blob photo locale (Dexie) ; absent → placeholder sage. */
    imageBlob?: Blob | null;
    /** URL same-origin du favicon (défaut `/favicon.svg`). */
    faviconUrl?: string;
  },
  deps?: BuildRecipeShareCardDeps
): Promise<File | null> {
  try {
    return await withTimeout(
      buildRecipeShareCardFileInner(recipe, options, deps),
      RECIPE_SHARE_CARD_BUILD_TIMEOUT_MS,
      "buildRecipeShareCardFile timeout"
    );
  } catch {
    return null;
  }
}

async function buildRecipeShareCardFileInner(
  recipe: Recipe,
  options?: {
    imageBlob?: Blob | null;
    faviconUrl?: string;
  },
  deps?: BuildRecipeShareCardDeps
): Promise<File> {
  const hasPhoto = Boolean(options?.imageBlob);
  const layout = planRecipeShareCardLayout(recipe, { hasPhoto });
  const createCanvas = deps?.createCanvas ?? defaultCreateCanvas;
  const { canvas, ctx } = createCanvas(layout.size, layout.size);
  const loadImage = deps?.loadImage ?? loadImageViaElement;
  const toBlob = deps?.toBlob ?? defaultToBlob;

  // Zone photo plein cadre (blob illisible / 0×0 → placeholder sage)
  let drewPhoto = false;
  if (options?.imageBlob) {
    let photo: ImageBitmap | HTMLImageElement | undefined;
    try {
      photo = await resolvePhotoBitmap(options.imageBlob);
      const { width: pw, height: ph } = getImageSourceSize(photo);
      if (pw > 0 && ph > 0) {
        ctx.save();
        try {
          ctx.beginPath();
          ctx.rect(0, 0, layout.size, layout.photoHeight);
          ctx.clip();
          drewPhoto = drawCover(ctx, photo, 0, 0, layout.size, layout.photoHeight);
        } finally {
          ctx.restore();
        }
      }
    } catch {
      drewPhoto = false;
    } finally {
      if (
        photo &&
        "close" in photo &&
        typeof (photo as ImageBitmap).close === "function"
      ) {
        (photo as ImageBitmap).close();
      }
    }
  }
  if (!drewPhoto) {
    drawPlaceholderPhoto(ctx, layout);
  }

  // Favicon overlay haut-droite (dessiné avant le bandeau CTA ; zones disjointes)
  try {
    const faviconUrl = options?.faviconUrl ?? "/favicon.svg";
    const logo = await loadImage(faviconUrl);
    const { x, y, size } = layout.logo;
    try {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 2;
      const r = Math.round(size * 0.16);
      ctx.fillStyle = "rgba(248, 244, 236, 0.92)";
      roundRect(ctx, x - 4, y - 4, size + 8, size + 8, r + 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.drawImage(logo, x, y, size, size);
    } finally {
      ctx.restore();
    }
  } catch {
    // Logo KO : card reste utilisable sans overlay.
  }

  drawCtaBand(ctx, layout);

  const blob = await toBlob(canvas, "image/png");
  if (!blob || blob.size === 0) {
    throw new Error("toBlob vide");
  }

  const safeName = (recipe.title?.trim() || "recette")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();
  return new File([blob], `${safeName || "recette"}-share.png`, {
    type: "image/png"
  });
}

function truncateToWidth(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1).trimEnd();
  }
  return `${cut}…`;
}

function roundRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
