/**
 * Vignette partage locale (~1080×1080) — seam `recipe-share-card`.
 * Photo (ou placeholder sage) + titre + portions? + aperçu ingrédients + favicon overlay haut-droite.
 * Aucun faux chrome UI (retour, cœur, Cuisiner).
 */

import type { Recipe } from "@cookies-et-coquilettes/domain";
import { formatIngredientLineForShare } from "./recipe-share-f2";

export const RECIPE_SHARE_CARD_SIZE = 1080;
/** Hauteur de la zone photo (plein cadre haut) — ~50 % du carré. */
export const RECIPE_SHARE_CARD_PHOTO_RATIO = 0.5;
export const RECIPE_SHARE_CARD_MAX_INGREDIENT_LINES = 5;
/** Logo ~10 % de la largeur card. */
export const RECIPE_SHARE_CARD_LOGO_RATIO = 0.1;

export const RECIPE_SHARE_CARD_COLORS = {
  cream: "#f8f4ec",
  primary: "#1f4f46",
  placeholder: "rgba(31, 79, 70, 0.08)",
  title: "#1a1a1a",
  body: "#333333"
} as const;

const FONT_STACK = '"Manrope", "Avenir Next", "Segoe UI", sans-serif';
/** Timeout média (Image / toBlob) — évite nativeShareBusy bloqué. */
const RECIPE_SHARE_CARD_MEDIA_TIMEOUT_MS = 10_000;
/** Budget global génération card (photo + logo + toBlob sérialisés). */
const RECIPE_SHARE_CARD_BUILD_TIMEOUT_MS = 12_000;

/** Chaînes interdites sur la vignette (faux chrome). */
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
  photoHeight: number;
  textBandTop: number;
  title: string;
  servingsLine: string | null;
  ingredientLines: string[];
  ingredientsTruncated: boolean;
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

function ingredientOrderKey(order: number | undefined | null): number {
  if (order === undefined || order === null || !Number.isFinite(order)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return order;
}

function sortedIngredients(recipe: Recipe) {
  return [...recipe.ingredients].sort((a, b) => {
    const ao = ingredientOrderKey(a.order);
    const bo = ingredientOrderKey(b.order);
    if (ao !== bo) {
      return ao - bo;
    }
    const idCmp = (a.id ?? "").localeCompare(b.id ?? "", "fr");
    if (idCmp !== 0) {
      return idCmp;
    }
    return (a.label ?? "").localeCompare(b.label ?? "", "fr");
  });
}

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

/** Portions affichées sur la card ; `null` si absentes. */
export function formatShareCardServings(servings?: number | null): string | null {
  if (servings === undefined || servings === null || !Number.isFinite(servings) || servings <= 0) {
    return null;
  }
  const n = Math.round(servings);
  if (n <= 0) {
    return null;
  }
  return n === 1 ? "1 portion" : `${n} portions`;
}

/**
 * Aperçu ingrédients pour la card (quelques lignes, préfixe `- `).
 * Tronque avec une ligne `…` si plus d’ingrédients que le max.
 */
export function buildShareCardIngredientPreview(
  recipe: Recipe,
  maxLines: number = RECIPE_SHARE_CARD_MAX_INGREDIENT_LINES
): { lines: string[]; truncated: boolean } {
  const limit = Math.max(0, Math.floor(maxLines));
  const all = sortedIngredients(recipe)
    .map((ing) => formatIngredientLineForShare(ing))
    .filter((line) => line.length > 0)
    .map((line) => (line.startsWith("- ") ? line : `- ${line}`));

  if (all.length === 0 || limit === 0) {
    return { lines: [], truncated: all.length > 0 };
  }

  if (all.length <= limit) {
    return { lines: all, truncated: false };
  }

  if (limit === 1) {
    return { lines: ["…"], truncated: true };
  }

  const keep = limit - 1;
  return {
    lines: [...all.slice(0, keep), "…"],
    truncated: true
  };
}

/** Plan de layout (testable sans canvas). */
export function planRecipeShareCardLayout(
  recipe: Recipe,
  options?: { hasPhoto?: boolean }
): RecipeShareCardLayout {
  const size = RECIPE_SHARE_CARD_SIZE;
  const photoHeight = Math.round(size * RECIPE_SHARE_CARD_PHOTO_RATIO);
  const padding = Math.round(size * 0.056);
  const logoSize = Math.round(size * RECIPE_SHARE_CARD_LOGO_RATIO);
  const logoMargin = Math.round(size * 0.028);
  const { lines, truncated } = buildShareCardIngredientPreview(recipe);

  return {
    size,
    photoHeight,
    textBandTop: photoHeight,
    title: recipe.title?.trim() || "Sans titre",
    servingsLine: formatShareCardServings(recipe.servingsBase),
    ingredientLines: lines,
    ingredientsTruncated: truncated,
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
  const haystack = [layout.title, layout.servingsLine ?? "", ...layout.ingredientLines]
    .join("\n")
    .toLowerCase();
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

function wrapText(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || maxLines <= 0) {
    return [];
  }
  const lines: string[] = [];
  let current = words[0]!;
  if (ctx.measureText(current).width > maxWidth) {
    current = truncateToWidth(ctx, current, maxWidth);
  }
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const trial = `${current} ${word}`;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      lines.push(current);
      if (lines.length >= maxLines) {
        // Plus de place : ellipsis sur la dernière ligne poussée
        const last = lines[lines.length - 1]!;
        lines[lines.length - 1] = truncateToWidth(
          ctx,
          last.endsWith("…") ? last : `${last}…`,
          maxWidth
        );
        return lines;
      }
      current =
        ctx.measureText(word).width <= maxWidth ? word : truncateToWidth(ctx, word, maxWidth);
    }
  }
  lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[kept.length - 1]!;
    kept[kept.length - 1] = truncateToWidth(
      ctx,
      last.endsWith("…") ? last : `${last}…`,
      maxWidth
    );
    return kept;
  }
  return lines.map((line) => truncateToWidth(ctx, line, maxWidth));
}

function drawPlaceholderPhoto(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layout: RecipeShareCardLayout
): void {
  ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.placeholder;
  ctx.fillRect(0, 0, layout.size, layout.photoHeight);
  ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.primary;
  ctx.globalAlpha = 0.12;
  const cx = layout.size / 2;
  const cy = layout.photoHeight / 2;
  ctx.beginPath();
  ctx.arc(cx, cy - 24, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
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

  // Fond crème global
  ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.cream;
  ctx.fillRect(0, 0, layout.size, layout.size);

  // Zone photo (blob illisible / 0×0 → placeholder sage, pas d’échec card)
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

  // Favicon overlay haut-droite
  try {
    const faviconUrl = options?.faviconUrl ?? "/favicon.svg";
    const logo = await loadImage(faviconUrl);
    const { x, y, size } = layout.logo;
    try {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 2;
      // Fond arrondi léger pour contraste
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

  // Bandeau texte
  const textWidth = layout.size - layout.padding * 2;
  let cursorY = layout.textBandTop + layout.padding;

  ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.title;
  ctx.font = `700 64px ${FONT_STACK}`;
  ctx.textBaseline = "top";
  const titleLines = wrapText(ctx, layout.title, textWidth, 2);
  for (const line of titleLines) {
    ctx.fillText(line, layout.padding, cursorY);
    cursorY += 72;
  }

  if (layout.servingsLine) {
    cursorY += 8;
    ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.primary;
    ctx.font = `600 36px ${FONT_STACK}`;
    ctx.fillText(layout.servingsLine, layout.padding, cursorY);
    cursorY += 52;
  } else {
    cursorY += 16;
  }

  if (layout.ingredientLines.length > 0) {
    ctx.fillStyle = RECIPE_SHARE_CARD_COLORS.body;
    ctx.font = `500 32px ${FONT_STACK}`;
    const lineHeight = 44;
    const maxY = layout.size - layout.padding;
    for (let i = 0; i < layout.ingredientLines.length; i++) {
      if (cursorY + lineHeight > maxY) {
        break;
      }
      const line = layout.ingredientLines[i]!;
      const remainingIncludingCurrent = layout.ingredientLines.length - i;
      const onlyOneSlotLeft = cursorY + 2 * lineHeight > maxY;
      // Dernier créneau alors qu’il reste plusieurs lignes → `…` plutôt que couper net.
      if (onlyOneSlotLeft && remainingIncludingCurrent > 1 && line !== "…") {
        ctx.fillText(truncateToWidth(ctx, "…", textWidth), layout.padding, cursorY);
        break;
      }
      const display =
        ctx.measureText(line).width <= textWidth
          ? line
          : truncateToWidth(ctx, line, textWidth);
      ctx.fillText(display, layout.padding, cursorY);
      cursorY += lineHeight;
    }
  }

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
