import type {
  ImportType,
  IngredientLine,
  ParsedInstructionStep,
  ParsedRecipeDraft,
  StepMediumDraft
} from "@cookies-et-coquilettes/domain";
import {
  filterStepIngredientIdsToKnown,
  remapStepIngredientIds
} from "./step-ingredient-mentions";

function dedupeStepMediaDrafts(media: StepMediumDraft[]): StepMediumDraft[] {
  const seen = new Set<string>();
  const out: StepMediumDraft[] = [];
  for (const m of media) {
    const key = m.type === "image" ? `i:${m.imageUrl}` : `v:${m.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/** Extrait le numéro d'étape en début de texte (ex. "25. Égaliser...", "Étape 11 :") */
function extractStepNumberFromText(text: string): number | undefined {
  const m = text.match(/^(\d+)[\.\)\s\-:]|^Étape\s+(\d+)/i);
  const n = m ? parseInt(m[1] ?? m[2] ?? "", 10) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 999 ? n : undefined;
}

function emptyScreenshotDraft(): ParsedRecipeDraft {
  return {
    title: "Recette importée",
    category: "SALE",
    ingredients: [],
    steps: [],
    source: {
      type: "SCREENSHOT",
      capturedAt: new Date().toISOString()
    }
  };
}

/** Fusionne plusieurs drafts screenshot ; remappe `ingredientIds` via dédup labels. */
export function mergeDrafts(drafts: ParsedRecipeDraft[]): ParsedRecipeDraft {
  if (drafts.length === 0) {
    return emptyScreenshotDraft();
  }
  if (drafts.length === 1) {
    const only = drafts[0];
    const validIds = new Set((only.ingredients ?? []).map((i) => i.id).filter(Boolean));
    const steps = filterStepIngredientIdsToKnown(only.steps ?? [], validIds);
    const unchanged =
      steps.length === (only.steps?.length ?? 0) &&
      steps.every((s, i) => s === only.steps![i]);
    return unchanged ? only : { ...only, steps };
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

  const labelToNewId = new Map<string, string>();
  const ingredientIdMap = new Map<string, string>();
  const ingredients: IngredientLine[] = [];
  let ingIdx = 0;
  for (const draft of drafts) {
    for (const ing of draft.ingredients ?? []) {
      const label = (ing.label ?? "").trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const existingNewId = labelToNewId.get(key);
      if (existingNewId) {
        if (ing.id) ingredientIdMap.set(ing.id, existingNewId);
        continue;
      }
      const newId = `ing-${ingIdx++}-${Date.now()}`;
      labelToNewId.set(key, newId);
      if (ing.id) ingredientIdMap.set(ing.id, newId);
      ingredients.push({
        id: newId,
        label,
        quantity: typeof ing.quantity === "number" ? ing.quantity : undefined,
        unit: ing.unit?.trim() || undefined,
        isScalable: Boolean(ing.isScalable)
      });
    }
  }

  const allSteps: Array<{
    order: number;
    text: string;
    draftIdx: number;
    media?: StepMediumDraft[];
    ingredientIds?: string[];
  }> = [];
  drafts.forEach((draft, draftIdx) => {
    let stepIdx = 0;
    for (const s of draft.steps ?? []) {
      const text = (s.text ?? "").trim();
      if (!text) continue;
      const fromText = extractStepNumberFromText(text);
      const fromPayload = typeof s.order === "number" ? s.order : undefined;
      const orderVal = fromText ?? fromPayload ?? (draftIdx * 1000 + stepIdx);
      const media = s.media?.length ? dedupeStepMediaDrafts(s.media) : undefined;
      allSteps.push({
        order: orderVal,
        text,
        draftIdx,
        media,
        ...(s.ingredientIds?.length ? { ingredientIds: [...s.ingredientIds] } : {})
      });
      stepIdx++;
    }
  });
  allSteps.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.draftIdx - b.draftIdx;
  });
  const remapped = filterStepIngredientIdsToKnown(
    remapStepIngredientIds(allSteps, ingredientIdMap),
    new Set(ingredients.map((i) => i.id))
  );
  const steps: ParsedInstructionStep[] = remapped.map((s, idx) => ({
    id: `step-${idx + 1}-${Date.now()}`,
    order: idx + 1,
    text: s.text,
    ...(s.media?.length ? { media: s.media } : {}),
    ...(s.ingredientIds?.length ? { ingredientIds: s.ingredientIds } : {})
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
