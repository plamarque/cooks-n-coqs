export const NOTEBOOK_SELECTION_REQUEST_MAX_LENGTH = 2_600;
export const NOTEBOOK_SELECTION_CANDIDATE_MAX_COUNT = 60;

/** Contrat exécutable du snapshot minimisé envoyé au décideur Assistant. */
export function isNotebookSelectionRequestV1(value) {
  if (!value || typeof value !== "object") return false;
  if (Object.keys(value).some((key) => key !== "request" && key !== "candidates")
    || typeof value.request !== "string"
    || !value.request.trim()
    || value.request.length > NOTEBOOK_SELECTION_REQUEST_MAX_LENGTH
    || !Array.isArray(value.candidates)
    || value.candidates.length > NOTEBOOK_SELECTION_CANDIDATE_MAX_COUNT) return false;

  const refs = new Set();
  return value.candidates.every((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    if (Object.keys(candidate).some((key) => key !== "candidateRef" && key !== "title" && key !== "ingredientLabels" && key !== "durationMin")
      || typeof candidate.candidateRef !== "string"
      || !/^candidate-[1-9]\d?$/.test(candidate.candidateRef)
      || refs.has(candidate.candidateRef)
      || typeof candidate.title !== "string"
      || !candidate.title.trim()
      || candidate.title.length > 180
      || !Array.isArray(candidate.ingredientLabels)
      || candidate.ingredientLabels.length > 40
      || !candidate.ingredientLabels.every((label) => typeof label === "string" && label.length <= 120)
      || !(candidate.durationMin === undefined || typeof candidate.durationMin === "number" && Number.isInteger(candidate.durationMin) && candidate.durationMin >= 0)) return false;
    refs.add(candidate.candidateRef);
    return true;
  });
}
