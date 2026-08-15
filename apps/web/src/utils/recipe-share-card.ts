/**
 * Image illustrative partage locale (~1080×1080) — seam `recipe-share-card`.
 * Photo plein cadre (ou placeholder sage) + bandeau bas « Recette envoyée via » + logo C&C inline.
 * Pas de fiche (titre / portions / ingrédients) ni faux chrome UI.
 */

import type { Recipe } from "@cookies-et-coquilettes/domain";
import { formatShareServingsLine } from "./recipe-share-f2";

export const RECIPE_SHARE_CARD_SIZE = 1080;
/** Hauteur du bandeau CTA bas (~18 % du carré). */
export const RECIPE_SHARE_CARD_CTA_RATIO = 0.18;
/** Logo ~10 % de la largeur card. */
export const RECIPE_SHARE_CARD_LOGO_RATIO = 0.1;

/** Microcopy bandeau image — attribution C&C (≠ CTA install texte F2). */
export const RECIPE_SHARE_CARD_CTA_LABEL = "Recette envoyée via";

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
/** Écart texte → logo dans le bandeau. */
const RECIPE_SHARE_CARD_LOGO_GAP_RATIO = 0.02;
/** Largeur approx. d’un glyphe (font 700 42px) pour le plan de layout sans canvas. */
const RECIPE_SHARE_CARD_APPROX_CHAR_WIDTH = 24;

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
  /** Logo dans le bandeau bas, inline après le libellé. */
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
  const gap = Math.round(size * RECIPE_SHARE_CARD_LOGO_GAP_RATIO);
  const ctaHeight = Math.round(size * RECIPE_SHARE_CARD_CTA_RATIO);
  const ctaY = size - ctaHeight;
  const approxTextWidth = Math.round(
    RECIPE_SHARE_CARD_CTA_LABEL.length * RECIPE_SHARE_CARD_APPROX_CHAR_WIDTH
  );
  const contentWidth = approxTextWidth + gap + logoSize;
  const startX = Math.round((size - contentWidth) / 2);

  return {
    size,
    photoHeight: size,
    cta: {
      y: ctaY,
      height: ctaHeight,
      label: RECIPE_SHARE_CARD_CTA_LABEL
    },
    hasPhoto: Boolean(options?.hasPhoto),
    logo: {
      x: startX + approxTextWidth + gap,
      y: ctaY + Math.round((ctaHeight - logoSize) / 2),
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
  layout: RecipeShareCardLayout,
  logo?: CanvasImageSource | null
): void {
  const { y, height, label } = layout.cta;
  ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.ctaBand;
  ctx.fillRect(0, y, layout.size, height);

  const logoSize = layout.logo.size;
  const gap = Math.round(layout.size * RECIPE_SHARE_CARD_LOGO_GAP_RATIO);
  const maxContent = layout.size - layout.padding * 2;

  ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.ctaText;
  ctx.font = `700 42px ${FONT_STACK}`;
  ctx.textBaseline = "middle";

  let display = label;
  let textWidth = ctx.measureText(display).width;
  if (logo) {
    const maxText = Math.max(0, maxContent - gap - logoSize);
    if (textWidth > maxText) {
      display = truncateToWidth(ctx, label, maxText);
      textWidth = ctx.measureText(display).width;
    }
  } else if (textWidth > maxContent) {
    display = truncateToWidth(ctx, label, maxContent);
    textWidth = ctx.measureText(display).width;
  }

  const totalWidth = logo ? textWidth + gap + logoSize : textWidth;
  const startX = Math.round((layout.size - totalWidth) / 2);
  ctx.fillText(display, startX, y + height / 2);

  if (logo) {
    try {
      const logoX = startX + textWidth + gap;
      const logoY = y + Math.round((height - logoSize) / 2);
      // Fond crème : le favicon est sombre, le bandeau aussi.
      const pad = 4;
      const r = Math.round(logoSize * 0.16);
      ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.cream;
      ctx.globalAlpha = 0.92;
      roundRect(ctx, logoX - pad, logoY - pad, logoSize + pad * 2, logoSize + pad * 2, r + 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
    } catch {
      // Dessin logo KO : le texte bandeau reste.
    }
  }
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

  // Logo inline dans le bandeau (une seule occurrence) ; KO → texte seul
  let logo: CanvasImageSource | undefined;
  try {
    const faviconUrl = options?.faviconUrl ?? "/favicon.svg";
    logo = await loadImage(faviconUrl);
  } catch {
    // Logo KO : card reste utilisable avec le texte bandeau seul.
  }

  drawCtaBand(ctx, layout, logo);

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
