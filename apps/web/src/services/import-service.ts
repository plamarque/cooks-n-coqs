import type {
  ImportService,
  ImportType,
  ParsedInstructionStep,
  ParsedRecipeDraft,
  ShareImportPayload
} from "@cookies-et-coquilettes/domain";
import { mergeDrafts } from "../utils/merge-recipe-drafts";
import { tryParseRecipeShareF2Text } from "../utils/recipe-share-f2";
import { reorderStepsRequestBody } from "../utils/reorder-steps-request";

function defaultBffUrl(): string {
  // Même trajet HTTPS dédié que l'Assistant : les multipart photo ne passent
  // pas par le proxy Vite intermédiaire.
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".ts.net")) {
    return `https://${window.location.hostname}:8443`;
  }
  return "http://localhost:8787";
}

const API_BASE_URL = import.meta.env?.VITE_BFF_URL || defaultBffUrl();

export async function extractImageFromUrl(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/import/extract-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    if (!response.ok) return undefined;
    const data = (await response.json()) as { imageUrl?: string };
    return data.imageUrl;
  } catch {
    return undefined;
  }
}

export async function generateRecipeImage(draft: {
  title: string;
  ingredients: Array<{ label?: string }>;
  steps: Array<{ text?: string }>;
}): Promise<string | undefined> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/generate-recipe-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title,
        ingredients: draft.ingredients,
        steps: draft.steps
      })
    });
    if (!response.ok) return undefined;
    const data = (await response.json()) as { imageUrl?: string };
    return data.imageUrl;
  } catch {
    return undefined;
  }
}

export async function generateCookingStepImage(stepText: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/generate-cooking-step-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepText })
    });
    if (!response.ok) return undefined;
    const data = (await response.json()) as { imageUrl?: string };
    return data.imageUrl;
  } catch {
    return undefined;
  }
}

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

function rethrowAbort(error: unknown): void {
  if ((error as Error)?.name === "AbortError") throw error;
}

async function parseResponse(response: Response): Promise<ParsedRecipeDraft> {
  if (!response.ok) {
    throw new Error(`Import failed: ${response.status}`);
  }
  return (await response.json()) as ParsedRecipeDraft;
}

function fallbackDraft(
  type: ImportType,
  seed?: string,
  url?: string
): ParsedRecipeDraft {
  const title = seed?.trim() ? seed.trim() : "Recette importée";
  return {
    title,
    category: "SALE",
    ingredients: [],
    steps: [],
    source: {
      type,
      url: url?.trim() || undefined,
      capturedAt: new Date().toISOString()
    }
  };
}

/** Réduction locale éphémère, partagée par l'import et l'analyse Assistant. */
export class ImageTransferPreparationError extends Error {
  constructor(readonly reason: "conversion" | "size", readonly originalBytes: number, readonly resultBytes?: number) {
    super(`image_transfer:${reason}`);
  }
}

async function decodeTransferImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    // Safari and some image formats can fail createImageBitmap while an HTMLImageElement works.
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = ""; URL.revokeObjectURL(url); } };
    } catch {
      URL.revokeObjectURL(url);
      throw new ImageTransferPreparationError("conversion", file.size);
    }
  }
}

export async function compressImageForTransfer(file: File, maxBytes?: number): Promise<File> {
  if (file.type && !file.type.startsWith("image/")) {
    if (maxBytes) throw new ImageTransferPreparationError("conversion", file.size);
    return file;
  }
  let decoded: Awaited<ReturnType<typeof decodeTransferImage>> | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    decoded = await decodeTransferImage(file);
    if (!decoded.width || !decoded.height) throw new ImageTransferPreparationError("conversion", file.size);
    // JPEG/PNG/WebP are accepted by vision as-is. Other browser-decodable
    // formats (notably HEIC) must become JPEG even when their file is small.
    if (maxBytes && file.size <= maxBytes && ["image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase())) return file;
    canvas = document.createElement("canvas");
    const longest = Math.max(decoded.width, decoded.height);
    const scale = Math.min(1, 1600 / longest);
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageTransferPreparationError("conversion", file.size);
    let lastSize: number | undefined;
    let previousWidth = 0;
    let previousHeight = 0;
    // Nine encodes at most. Never shrink beyond a 1200 px longest edge (or
    // the original size for smaller captures), so recipe text stays legible.
    for (const maxDimension of [1600, 1400, 1200]) {
      const dimensionScale = Math.min(1, maxDimension / longest);
      const width = Math.max(1, Math.round(decoded.width * dimensionScale));
      const height = Math.max(1, Math.round(decoded.height * dimensionScale));
      if (width === previousWidth && height === previousHeight) continue;
      previousWidth = width;
      previousHeight = height;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.68, 0.55]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas!.toBlob(resolve, "image/jpeg", quality));
        if (!blob) throw new ImageTransferPreparationError("conversion", file.size, lastSize);
        lastSize = blob.size;
        if (!maxBytes || blob.size <= maxBytes) {
          if (blob.type !== "image/jpeg") throw new ImageTransferPreparationError("conversion", file.size, blob.size);
          return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
        }
      }
    }
    throw new ImageTransferPreparationError("size", file.size, lastSize);
  } catch (error) {
    if (maxBytes) throw error instanceof ImageTransferPreparationError ? error : new ImageTransferPreparationError("conversion", file.size);
    return file;
  } finally {
    decoded?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

class BffImportService implements ImportService {
  async importFromUrl(url: string, options?: { signal?: AbortSignal }): Promise<ParsedRecipeDraft> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/import/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }), signal: options?.signal
      });
      return await parseResponse(response);
    } catch (error) {
      rethrowAbort(error);
      // eslint-disable-next-line no-console
      console.warn("importFromUrl fallback draft", error);
      return fallbackDraft("URL", "Recette depuis URL", url);
    }
  }

  async importFromShare(payload: ShareImportPayload): Promise<ParsedRecipeDraft> {
    if (payload.text) {
      const f2 = tryParseRecipeShareF2Text(payload.text, { sourceType: "SHARE" });
      if (f2) {
        return f2;
      }
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/import/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return await parseResponse(response);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("importFromShare fallback draft", error);
      return fallbackDraft("SHARE", payload.title ?? "Recette partagée", payload.url);
    }
  }

  async importFromScreenshot(file: File, options?: { signal?: AbortSignal; contextText?: string; assistantPrepared?: boolean }): Promise<ParsedRecipeDraft> {
    try {
      const compressed = options?.assistantPrepared ? file : await compressImageForTransfer(file);
      if (compressed.size > (options?.assistantPrepared ? 4 * 1024 * 1024 : MAX_SCREENSHOT_BYTES)) {
        throw new Error(options?.assistantPrepared ? "Image trop volumineuse (max 4 Mio)." : "Image trop volumineuse (max 5 Mo).");
      }

      const body = new FormData();
      body.append("file", compressed);
      if (options?.contextText?.trim()) body.append("contextText", options.contextText.trim());

      const response = await fetch(`${API_BASE_URL}/api/import/screenshot`, {
        method: "POST",
        body, signal: options?.signal
      });
      return await parseResponse(response);
    } catch (error) {
      rethrowAbort(error);
      // eslint-disable-next-line no-console
      console.warn("importFromScreenshot fallback draft", error);
      return fallbackDraft("SCREENSHOT", file.name.replace(/\.[^.]+$/, ""));
    }
  }

  async importFromScreenshots(files: File[], options?: { signal?: AbortSignal; contextText?: string; assistantPrepared?: boolean }): Promise<ParsedRecipeDraft> {
    const drafts: ParsedRecipeDraft[] = [];
    for (const file of files) {
      const draft = await this.importFromScreenshot(file, options);
      drafts.push(draft);
    }
    let merged = mergeDrafts(drafts);
    if (merged.steps.length > 1) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/import/reorder-steps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reorderStepsRequestBody(merged.steps)),
          signal: options?.signal
        });
        if (res.ok) {
          const data = (await res.json()) as { steps: ParsedInstructionStep[] };
          merged = { ...merged, steps: data.steps };
        }
      } catch (error) {
        rethrowAbort(error);
        // keep merged as-is on reorder failure
      }
    }
    return merged;
  }

  async importFromText(text: string, options?: { signal?: AbortSignal }): Promise<ParsedRecipeDraft> {
    const f2 = tryParseRecipeShareF2Text(text, { sourceType: "TEXT" });
    if (f2) {
      return f2;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/import/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }), signal: options?.signal
      });
      return await parseResponse(response);
    } catch (error) {
      rethrowAbort(error);
      // eslint-disable-next-line no-console
      console.warn("importFromText fallback draft", error);
      return fallbackDraft("TEXT", "Recette depuis texte");
    }
  }
}

export const bffImportService = new BffImportService();

/** Adaptateur Assistant : aucun appel Dexie ni hydratation média. */
export const assistantImportAdapter = {
  importImage: (file: File, contextText: string, signal: AbortSignal) => bffImportService.importFromScreenshot(file, { contextText, signal, assistantPrepared: true }),
  importUrl: (url: string, signal: AbortSignal) => bffImportService.importFromUrl(url, { signal }),
  importText: (text: string, signal: AbortSignal) => bffImportService.importFromText(text, { signal })
};
