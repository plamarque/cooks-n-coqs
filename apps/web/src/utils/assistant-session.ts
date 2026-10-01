import type { ImportSource, ParsedRecipeDraft } from "@cookies-et-coquilettes/domain";

export type AssistantImportRoute = "image" | "url" | "text";
export type AssistantSessionPhase = "idle" | "importing" | "ready" | "error";

export interface AssistantPreview {
  requestId: number;
  draft: ParsedRecipeDraft;
  source: ImportSource | undefined;
  sourceFiles: File[];
}

export interface AssistantImportAdapter {
  importImage(file: File, contextText: string, signal: AbortSignal): Promise<ParsedRecipeDraft>;
  importUrl(url: string, signal: AbortSignal): Promise<ParsedRecipeDraft>;
  importText(text: string, signal: AbortSignal): Promise<ParsedRecipeDraft>;
}

export function routeAssistantImport(text: string, attachment: File | null): AssistantImportRoute {
  if (attachment) return "image";
  if (/^https?:\/\/\S+$/i.test(text.trim())) return "url";
  return "text";
}

/** Etat propriétaire, volontairement non sérialisable : les File restent en mémoire. */
export class AssistantSession {
  phase: AssistantSessionPhase = "idle";
  preview: AssistantPreview | null = null;
  error: string | null = null;
  private requestId = 0;
  private controller: AbortController | null = null;

  async import(text: string, attachment: File | null, adapter: AssistantImportAdapter): Promise<AssistantPreview | null> {
    this.cancel();
    this.preview = null;
    const requestId = ++this.requestId;
    const controller = new AbortController();
    this.controller = controller;
    this.phase = "importing";
    this.error = null;
    const route = routeAssistantImport(text, attachment);
    try {
      const draft = route === "image" && attachment
        ? await adapter.importImage(attachment, text, controller.signal)
        : route === "url"
          ? await adapter.importUrl(text.trim(), controller.signal)
          : await adapter.importText(text, controller.signal);
      if (controller.signal.aborted || requestId !== this.requestId) return null;
      const preview = { requestId, draft, source: draft.source, sourceFiles: attachment ? [attachment] : [] };
      this.preview = preview;
      this.phase = "ready";
      return preview;
    } catch (error) {
      if (controller.signal.aborted || requestId !== this.requestId || (error as Error).name === "AbortError") return null;
      this.phase = "error";
      this.error = "Impossible d’importer cette recette. Vérifiez votre entrée puis réessayez.";
      return null;
    } finally {
      if (requestId === this.requestId) this.controller = null;
    }
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    ++this.requestId;
    if (this.phase === "importing") this.phase = "idle";
  }

  closePreview(): void {
    this.cancel();
    this.preview = null;
    this.error = null;
    this.phase = "idle";
  }
}
