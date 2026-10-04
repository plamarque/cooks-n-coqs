import type { NotebookCandidateWireV1, NotebookSelectionRequestV1 } from "./recipe";

export const NOTEBOOK_SELECTION_REQUEST_MAX_LENGTH = 2_600;
export const NOTEBOOK_SELECTION_CANDIDATE_MAX_COUNT = 60;

/**
 * Contrat exécutable du snapshot minimisé envoyé au décideur Assistant.
 * Il est partagé par le navigateur et le BFF afin qu'aucun des deux ne
 * puisse accepter une forme que l'autre ne sait pas produire.
 */
export function isNotebookSelectionRequestV1(value: unknown): value is NotebookSelectionRequestV1 {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  if (Object.keys(request).some((key) => key !== "request" && key !== "candidates")
    || typeof request.request !== "string"
    || !request.request.trim()
    || request.request.length > NOTEBOOK_SELECTION_REQUEST_MAX_LENGTH
    || !Array.isArray(request.candidates)
    || request.candidates.length > NOTEBOOK_SELECTION_CANDIDATE_MAX_COUNT) return false;

  const refs = new Set<string>();
  return request.candidates.every((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const entry = candidate as Record<string, unknown>;
    if (Object.keys(entry).some((key) => key !== "candidateRef" && key !== "title" && key !== "ingredientLabels" && key !== "durationMin")
      || typeof entry.candidateRef !== "string"
      || !/^candidate-[1-9]\d?$/.test(entry.candidateRef)
      || refs.has(entry.candidateRef)
      || typeof entry.title !== "string"
      || !entry.title.trim()
      || entry.title.length > 180
      || !Array.isArray(entry.ingredientLabels)
      || entry.ingredientLabels.length > 40
      || !entry.ingredientLabels.every((label) => typeof label === "string" && label.length <= 120)
      || !(entry.durationMin === undefined || typeof entry.durationMin === "number" && Number.isInteger(entry.durationMin) && entry.durationMin >= 0)) return false;
    refs.add(entry.candidateRef);
    return true;
  });
}
