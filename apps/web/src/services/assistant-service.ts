import type { AssistantConversationTurnV1, NotebookCandidateWireV1, NotebookSelectionWireV1, ParsedRecipeDraft } from "@cookies-et-coquilettes/domain";

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
  constructor(readonly category: "preparation" | "network" | "http" | "response", readonly reference: string, readonly status?: number) {
    super(`assistant_image:${category}`);
  }
}

function traceImageRequest(category: AssistantImageRequestError["category"] | "ok", reference: string, imageCount: number, durationMs: number, status?: number): void {
  // Aucune donnée de photo, demande ou réponse IA n'est journalisée.
  console.info("assistant_image_diagnostic", { category, reference, imageCount, durationMs, status });
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

export async function selectNotebookRecipe(request: string, candidates: NotebookCandidateWireV1[], signal: AbortSignal, turns: AssistantConversationTurnV1[] = [], clarificationCount = 0): Promise<NotebookSelectionWireV1> {
  const response = await fetch(`${API_BASE_URL}/api/assistant/select`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request, candidates, turns, clarificationCount }), signal });
  if (!response.ok) throw new Error("selection unavailable");
  return await response.json() as NotebookSelectionWireV1;
}

export async function generateAssistantRecipe(request: string, signal: AbortSignal, turns: AssistantConversationTurnV1[] = []): Promise<ParsedRecipeDraft> {
  const response = await fetch(`${API_BASE_URL}/api/assistant/recipe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request, turns }), signal });
  if (!response.ok) throw new Error("recipe unavailable");
  return await response.json() as ParsedRecipeDraft;
}

export async function summarizeAssistantImage(file: File, contextText: string, signal: AbortSignal): Promise<string> {
  const summaries = await summarizeAssistantImages([file], contextText, signal);
  if (!summaries[0]) throw new Error("image intent invalid");
  return summaries[0];
}

/** Une requête courte par image évite qu'un lot de photos garde une connexion
 * HTTP ouverte pendant toutes les reprises fournisseur. Rien n'est persisté. */
export async function summarizeAssistantImages(files: readonly File[], contextText: string, signal: AbortSignal): Promise<string[]> {
  if (!files.length || files.length > 5) throw new AssistantImageRequestError("preparation", crypto.randomUUID());
  const summaries: string[] = [];
  for (const file of files) {
    if (signal.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    summaries.push(await summarizeOneAssistantImage(file, contextText, signal));
  }
  return summaries;
}

async function summarizeOneAssistantImage(file: File, contextText: string, signal: AbortSignal): Promise<string> {
  const reference = crypto.randomUUID();
  const startedAt = Date.now();
  if (file.size > 4 * 1024 * 1024) {
    traceImageRequest("preparation", reference, 1, Date.now() - startedAt, 413);
    throw new AssistantImageRequestError("preparation", reference, 413);
  }
  const form = new FormData();
  try {
    form.append("file", file);
    form.append("contextText", truncateAssistantImageContext(contextText));
  } catch {
    traceImageRequest("preparation", reference, 1, Date.now() - startedAt);
    throw new AssistantImageRequestError("preparation", reference);
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/assistant/image-intent?attempt=${reference}`, { method: "POST", body: form, signal });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    traceImageRequest("network", reference, 1, Date.now() - startedAt);
    throw new AssistantImageRequestError("network", reference);
  }
  // The browser may hide response headers on a cross-origin BFF request. The
  // client-generated attempt ID is also sent to the BFF, so it is the stable
  // reference on both sides even when x-request-id is not exposed by CORS.
  const responseReference = reference;
  if (!response.ok) {
    traceImageRequest("http", responseReference, 1, Date.now() - startedAt, response.status);
    throw new AssistantImageRequestError("http", responseReference, response.status);
  }
  let value: { summaries?: unknown };
  try { value = await response.json() as { summaries?: unknown }; }
  catch {
    traceImageRequest("response", responseReference, 1, Date.now() - startedAt, response.status);
    throw new AssistantImageRequestError("response", responseReference, response.status);
  }
  if (!Array.isArray(value.summaries) || value.summaries.length !== 1 || typeof value.summaries[0] !== "string" || !value.summaries[0].trim()) {
    traceImageRequest("response", responseReference, 1, Date.now() - startedAt, response.status);
    throw new AssistantImageRequestError("response", responseReference, response.status);
  }
  traceImageRequest("ok", responseReference, 1, Date.now() - startedAt, response.status);
  return value.summaries[0];
}
