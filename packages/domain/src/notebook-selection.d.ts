export interface NotebookCandidateWireV1 {
  candidateRef: string;
  title: string;
  ingredientLabels: string[];
  durationMin?: number;
}

export interface NotebookSelectionRequestV1 {
  request: string;
  candidates: NotebookCandidateWireV1[];
}

export declare const NOTEBOOK_SELECTION_REQUEST_MAX_LENGTH: 2600;
export declare const NOTEBOOK_SELECTION_CANDIDATE_MAX_COUNT: 60;
export declare function isNotebookSelectionRequestV1(value: unknown): value is NotebookSelectionRequestV1;
