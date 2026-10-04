import { decodeAssistantDraftWireV1, isNotebookSelectionWireV1, type AssistantConversationTurnV1, type NotebookCandidateWireV1, type NotebookSelectionWireV1, type ParsedRecipeDraft } from "@cookies-et-coquilettes/domain";
import { compressImageForTransfer, ImageTransferPreparationError } from "./import-service";

function defaultBffUrl(): string {
  // Le proxy Vite peut rejeter un multipart mobile avant le BFF (donc sans
  // diagnostic). Tailscale Serve expose le BFF sur son port HTTPS dédié.
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".ts.net")) {
    return `https://${window.location.hostname}:8443`;
  }
  return "http://localhost:8787";
}

const API_BASE_URL = import.meta.env?.VITE_BFF_URL || defaultBffUrl();
export const ASSISTANT_SELECTION_REQUEST_MAX_LENGTH = 2_600;
export const ASSISTANT_IMAGE_CONTEXT_MAX_LENGTH = 1_200;

export class AssistantImageRequestError extends Error {
  readonly assistantStage = "vision";
  constructor(readonly category: "preparation" | "network" | "http" | "response", readonly reference: string, readonly status?: number, readonly preparationReason?: "conversion" | "size" | "count", readonly imageIndex?: number) {
    super(`assistant_image:${category}`);
  }
}
export class AssistantRecipeRequestError extends Error {
  constructor(readonly category: "unavailable" | "invalid") {
    super(`assistant_recipe:${category}`);
  }
}
export type AssistantImageProgress = { phase: "preparing" | "reading"; current: number; total: number; durationMs?: number };

/** La vignette est affichée seulement pendant l'étape qui traite une photo précise. */
export function resolveAssistantProgressPhotoUrl(phase: string, progress: AssistantImageProgress | null, previewUrls: readonly string[]): string | null {
  if (phase !== "analyzing" || !progress) return null;
  return previewUrls[progress.current - 1] ?? null;
}

function traceImageRequest(category: AssistantImageRequestError["category"] | "ok", reference: string, imageIndex: number, originalBytes: number, resultBytes: number | undefined, durationMs: number, status?: number): void {
  // Aucune donnée de photo, demande ou réponse IA n'est journalisée.
  console.info("assistant_image_diagnostic", { category, reference, imageIndex, originalBytes, resultBytes, durationMs, status });
}

/** Prépare le lot dans son ordre initial, sans décodages simultanés. */
export async function prepareAssistantImages(files: readonly File[], isCurrent: () => boolean, onProgress?: (progress: AssistantImageProgress) => void): Promise<File[] | null> {
  if (files.length > 5) throw new AssistantImageRequestError("preparation", crypto.randomUUID(), undefined, "count");
  const prepared: File[] = [];
  for (const [index, file] of files.entries()) {
    if (!isCurrent()) return null;
    onProgress?.({ phase: "preparing", current: index + 1, total: files.length });
    const reference = crypto.randomUUID();
    const startedAt = Date.now();
    try {
      const copy = await compressImageForTransfer(file, 4 * 1024 * 1024);
      if (!isCurrent()) return null;
      if (copy.size > 4 * 1024 * 1024) throw new ImageTransferPreparationError("size", file.size, copy.size);
      traceImageRequest("ok", reference, index + 1, file.size, copy.size, Date.now() - startedAt);
      prepared.push(copy);
    } catch (error) {
      if (!isCurrent()) return null;
      const reason = error instanceof ImageTransferPreparationError ? error.reason : "conversion";
      const resultBytes = error instanceof ImageTransferPreparationError ? error.resultBytes : undefined;
      traceImageRequest("preparation", reference, index + 1, file.size, resultBytes, Date.now() - startedAt);
      throw new AssistantImageRequestError("preparation", reference, reason === "size" ? 413 : undefined, reason, index + 1);
    }
  }
  return prepared;
}

export function truncateAssistantImageContext(contextText: string): string {
  if (new TextEncoder().encode(contextText).length <= ASSISTANT_IMAGE_CONTEXT_MAX_LENGTH) return contextText;
  let end = Math.min(contextText.length, ASSISTANT_IMAGE_CONTEXT_MAX_LENGTH);
  while (end > 0 && new TextEncoder().encode(contextText.slice(0, end)).length > ASSISTANT_IMAGE_CONTEXT_MAX_LENGTH) end -= 1;
  return contextText.slice(0, end);
}

/** Les résumés image ont priorité : ils restent intacts même si le texte libre doit être raccourci. */
export function buildAssistantSelectionRequest(text: string, visualSummaries: readonly string[] = []): string {
  const visualContext = visualSummaries.length
    ? `Résumés visuels temporaires: ${visualSummaries.join("\n")}`
    : "";
  if (!visualContext) return text.slice(0, ASSISTANT_SELECTION_REQUEST_MAX_LENGTH);
  if (visualContext.length >= ASSISTANT_SELECTION_REQUEST_MAX_LENGTH) {
    return visualContext.slice(0, ASSISTANT_SELECTION_REQUEST_MAX_LENGTH);
  }
  const availableTextLength = ASSISTANT_SELECTION_REQUEST_MAX_LENGTH - visualContext.length - 1;
  return `${text.slice(0, Math.max(0, availableTextLength))}\n${visualContext}`;
}

export async function selectNotebookRecipe(request: string, candidates: NotebookCandidateWireV1[], signal: AbortSignal): Promise<NotebookSelectionWireV1> {
  if (request.length > ASSISTANT_SELECTION_REQUEST_MAX_LENGTH) throw new Error("selection input too large");
  const response = await fetch(`${API_BASE_URL}/api/assistant/select`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request, candidates }), signal });
  if (!response.ok) throw new Error("selection unavailable");
  const wire: unknown = await response.json();
  if (!isNotebookSelectionWireV1(wire)) throw new Error("selection invalid wire");
  return wire;
}

export async function generateAssistantRecipe(request: string, signal: AbortSignal, turns: AssistantConversationTurnV1[] = []): Promise<ParsedRecipeDraft> {
  const response = await fetch(`${API_BASE_URL}/api/assistant/recipe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request, turns }), signal });
  if (!response.ok) throw new AssistantRecipeRequestError("unavailable");
  let wire: unknown;
  try { wire = await response.json(); } catch { throw new AssistantRecipeRequestError("invalid"); }
  const draft = decodeAssistantDraftWireV1(wire);
  if (!draft) throw new AssistantRecipeRequestError("invalid");
  return draft;
}

export async function summarizeAssistantImage(file: File, contextText: string, signal: AbortSignal): Promise<string> {
  const summaries = await summarizeAssistantImages([file], contextText, signal);
  if (!summaries[0]) throw new Error("image intent invalid");
  return summaries[0];
}

/** Une requête courte par image évite qu'un lot de photos garde une connexion
 * HTTP ouverte pendant toutes les reprises fournisseur. Rien n'est persisté. */
export async function summarizeAssistantImages(files: readonly File[], contextText: string, signal: AbortSignal, onProgress?: (progress: AssistantImageProgress) => void): Promise<string[]> {
  if (!files.length || files.length > 5) throw new AssistantImageRequestError("preparation", crypto.randomUUID(), undefined, "count");
  const summaries: string[] = [];
  for (const [index, file] of files.entries()) {
    if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    onProgress?.({ phase: "reading", current: index + 1, total: files.length });
    const startedAt = Date.now();
    summaries.push(await summarizeOneAssistantImage(file, contextText, signal, index + 1));
    onProgress?.({ phase: "reading", current: index + 1, total: files.length, durationMs: Date.now() - startedAt });
  }
  return summaries;
}

async function summarizeOneAssistantImage(file: File, contextText: string, signal: AbortSignal, index: number): Promise<string> {
  const reference = crypto.randomUUID();
  const startedAt = Date.now();
  if (file.size > 4 * 1024 * 1024) {
    traceImageRequest("preparation", reference, index, file.size, file.size, Date.now() - startedAt, 413);
    throw new AssistantImageRequestError("preparation", reference, 413, "size", index);
  }
  const form = new FormData();
  try {
    form.append("file", file);
    form.append("contextText", truncateAssistantImageContext(contextText));
  } catch {
    traceImageRequest("preparation", reference, index, file.size, file.size, Date.now() - startedAt);
    throw new AssistantImageRequestError("preparation", reference, undefined, "conversion", index);
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/assistant/image-intent?attempt=${reference}`, { method: "POST", body: form, signal });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    traceImageRequest("network", reference, index, file.size, file.size, Date.now() - startedAt);
    throw new AssistantImageRequestError("network", reference, undefined, undefined, index);
  }
  // The browser may hide response headers on a cross-origin BFF request. The
  // client-generated attempt ID is also sent to the BFF, so it is the stable
  // reference on both sides even when x-request-id is not exposed by CORS.
  const responseReference = reference;
  if (!response.ok) {
    traceImageRequest("http", responseReference, index, file.size, file.size, Date.now() - startedAt, response.status);
    throw new AssistantImageRequestError("http", responseReference, response.status, undefined, index);
  }
  let value: { summaries?: unknown };
  try { value = await response.json() as { summaries?: unknown }; }
  catch {
    traceImageRequest("response", responseReference, index, file.size, file.size, Date.now() - startedAt, response.status);
    throw new AssistantImageRequestError("response", responseReference, response.status, undefined, index);
  }
  if (!Array.isArray(value.summaries) || value.summaries.length !== 1 || typeof value.summaries[0] !== "string" || !value.summaries[0].trim()) {
    traceImageRequest("response", responseReference, index, file.size, file.size, Date.now() - startedAt, response.status);
    throw new AssistantImageRequestError("response", responseReference, response.status, undefined, index);
  }
  traceImageRequest("ok", responseReference, index, file.size, file.size, Date.now() - startedAt, response.status);
  return value.summaries[0];
}
