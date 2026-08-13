import type { ParsedInstructionStep } from "@cookies-et-coquilettes/domain";

/** Corps POST `/api/import/reorder-steps` — conserve `ingredientIds` du merge. */
export function reorderStepsRequestBody(steps: ParsedInstructionStep[]): {
  steps: Array<{
    id: string;
    order: number;
    text: string;
    ingredientIds?: string[];
    media?: ParsedInstructionStep["media"];
  }>;
} {
  return {
    steps: steps.map((s) => ({
      id: s.id,
      order: s.order,
      text: s.text,
      ...(s.ingredientIds?.length ? { ingredientIds: s.ingredientIds } : {}),
      ...(s.media?.length ? { media: s.media } : {})
    }))
  };
}
