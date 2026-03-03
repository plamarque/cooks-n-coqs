import type {
  ImportService,
  ImportType,
  IngredientLine,
  InstructionStep,
  ParsedRecipeDraft,
  ShareImportPayload
} from "@cookies-et-coquilettes/domain";

const API_BASE_URL = import.meta.env.VITE_BFF_URL || "http://localhost:8787";

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
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

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

async function compressScreenshot(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const maxSize = 1600;
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    if (!blob) {
      return file;
    }

    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg"
    });
  } catch (_error) {
    return file;
  }
}

/** Extrait le numéro d'étape en début de texte (ex. "25. Égaliser...", "Étape 11 :") */
function extractStepNumberFromText(text: string): number | undefined {
  const m = text.match(/^(\d+)[\.\)\s\-:]|^Étape\s+(\d+)/i);
  const n = m ? parseInt(m[1] ?? m[2] ?? "", 10) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 999 ? n : undefined;
}

function mergeDrafts(drafts: ParsedRecipeDraft[]): ParsedRecipeDraft {
  if (drafts.length === 0) {
    return fallbackDraft("SCREENSHOT", "Recette importée");
  }
  if (drafts.length === 1) {
    return drafts[0];
  }

  const first = drafts[0];
  const title =
    drafts.map((d) => d.title?.trim()).find((t) => t && t !== "Recette depuis capture") ??
    first.title ??
    "Recette importée";
  const category = first.category ?? "SALE";
  const servingsBase =
    drafts.find((d) => typeof d.servingsBase === "number")?.servingsBase ?? first.servingsBase;
  const prepTimeMin =
    drafts.find((d) => typeof d.prepTimeMin === "number")?.prepTimeMin ?? first.prepTimeMin;
  const cookTimeMin =
    drafts.find((d) => typeof d.cookTimeMin === "number")?.cookTimeMin ?? first.cookTimeMin;
  const restTimeMin =
    drafts.find((d) => typeof d.restTimeMin === "number")?.restTimeMin ?? first.restTimeMin;
  const imageUrl = drafts.find((d) => d.imageUrl)?.imageUrl ?? first.imageUrl;

  const seenLabels = new Set<string>();
  const ingredients: IngredientLine[] = [];
  let ingIdx = 0;
  for (const draft of drafts) {
    for (const ing of draft.ingredients ?? []) {
      const label = (ing.label ?? "").trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seenLabels.has(key)) continue;
      seenLabels.add(key);
      ingredients.push({
        id: `ing-${ingIdx++}-${Date.now()}`,
        label,
        quantity: typeof ing.quantity === "number" ? ing.quantity : undefined,
        unit: ing.unit?.trim() || undefined,
        isScalable: Boolean(ing.isScalable)
      });
    }
  }

  const allSteps: Array<{ order: number; text: string; draftIdx: number }> = [];
  drafts.forEach((draft, draftIdx) => {
    let stepIdx = 0;
    for (const s of draft.steps ?? []) {
      const text = (s.text ?? "").trim();
      if (!text) continue;
      const fromText = extractStepNumberFromText(text);
      const fromPayload = typeof s.order === "number" ? s.order : undefined;
      const orderVal = fromText ?? fromPayload ?? (draftIdx * 1000 + stepIdx);
      allSteps.push({ order: orderVal, text, draftIdx });
      stepIdx++;
    }
  });
  allSteps.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.draftIdx - b.draftIdx;
  });
  const steps: InstructionStep[] = allSteps.map((s, idx) => ({
    id: `step-${idx + 1}-${Date.now()}`,
    order: idx + 1,
    text: s.text
  }));

  return {
    title,
    category,
    servingsBase,
    prepTimeMin,
    cookTimeMin,
    restTimeMin,
    ingredients,
    steps,
    imageUrl,
    source: first.source ?? {
      type: "SCREENSHOT" as ImportType,
      capturedAt: new Date().toISOString()
    }
  };
}

class BffImportService implements ImportService {
  async importFromUrl(url: string): Promise<ParsedRecipeDraft> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/import/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      return await parseResponse(response);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("importFromUrl fallback draft", error);
      return fallbackDraft("URL", "Recette depuis URL", url);
    }
  }

  async importFromShare(payload: ShareImportPayload): Promise<ParsedRecipeDraft> {
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

  async importFromScreenshot(file: File): Promise<ParsedRecipeDraft> {
    try {
      const compressed = await compressScreenshot(file);
      if (compressed.size > MAX_SCREENSHOT_BYTES) {
        throw new Error("Image trop volumineuse (max 5 Mo).");
      }

      const body = new FormData();
      body.append("file", compressed);

      const response = await fetch(`${API_BASE_URL}/api/import/screenshot`, {
        method: "POST",
        body
      });
      return await parseResponse(response);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("importFromScreenshot fallback draft", error);
      return fallbackDraft("SCREENSHOT", file.name.replace(/\.[^.]+$/, ""));
    }
  }

  async importFromScreenshots(files: File[]): Promise<ParsedRecipeDraft> {
    const drafts: ParsedRecipeDraft[] = [];
    for (const file of files) {
      const draft = await this.importFromScreenshot(file);
      drafts.push(draft);
    }
    let merged = mergeDrafts(drafts);
    if (merged.steps.length > 1) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/import/reorder-steps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            steps: merged.steps.map((s) => ({ id: s.id, order: s.order, text: s.text }))
          })
        });
        if (res.ok) {
          const data = (await res.json()) as { steps: InstructionStep[] };
          merged = { ...merged, steps: data.steps };
        }
      } catch {
        // keep merged as-is on reorder failure
      }
    }
    return merged;
  }

  async importFromText(text: string): Promise<ParsedRecipeDraft> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/import/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      return await parseResponse(response);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("importFromText fallback draft", error);
      return fallbackDraft("TEXT", "Recette depuis texte");
    }
  }
}

export const bffImportService = new BffImportService();
