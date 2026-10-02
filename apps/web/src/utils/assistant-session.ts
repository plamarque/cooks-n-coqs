import type { AssistantConversationTurnV1, ImportSource, ParsedRecipeDraft } from "@cookies-et-coquilettes/domain";
import { AssistantImageRequestError } from "../services/assistant-service";

export type AssistantImportRoute = "image" | "url" | "text";
export type AssistantSessionPhase = "idle" | "importing" | "analyzing" | "searching" | "creating" | "ready" | "error";

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

export type AssistantTextResolution =
  | { kind: "candidate"; candidateRef: string }
  | { kind: "draft"; draft: ParsedRecipeDraft };

export interface AssistantTextAdapter {
  resolve(text: string, signal: AbortSignal, progress: (phase: "importing" | "searching" | "creating") => void): Promise<AssistantTextResolution>;
}

export function routeAssistantImport(text: string, attachments: readonly File[]): AssistantImportRoute {
  if (attachments.length) return "image";
  if (/^https?:\/\/\S+$/i.test(text.trim())) return "url";
  return "text";
}

/** Etat propriétaire, volontairement non sérialisable : les File restent en mémoire. */
export class AssistantSession {
  phase: AssistantSessionPhase = "idle";
  preview: AssistantPreview | null = null;
  error: string | null = null;
  turns: AssistantConversationTurnV1[] = [];
  clarificationCount = 0;
  question: string | null = null;

  beginConversation(text: string): void {
    this.question = null;
    this.turns.push({ role: "user", text: text.trim() });
  }

  showClarification(question: string): void {
    this.question = question;
    this.turns.push({ role: "assistant", text: question });
    this.clarificationCount += 1;
    this.phase = "idle";
  }

  resetConversation(): void {
    this.turns = [];
    this.clarificationCount = 0;
    this.question = null;
  }
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
    const route = routeAssistantImport(text, attachment ? [attachment] : []);
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

  /** Même propriétaire AbortController/requestId pour sélection puis génération texte. */
  async resolveText(text: string, adapter: AssistantTextAdapter): Promise<AssistantTextResolution | null> {
    this.controller?.abort();
    this.controller = null;
    this.preview = null;
    const requestId = ++this.requestId;
    const controller = new AbortController();
    this.controller = controller;
    this.phase = "analyzing";
    this.error = null;
    const previousTurnsLength = this.turns.length;
    this.beginConversation(text);
    try {
      const result = await adapter.resolve(text, controller.signal, (phase) => {
        if (!controller.signal.aborted && requestId === this.requestId) this.phase = phase;
      });
      if (controller.signal.aborted || requestId !== this.requestId) return null;
      if (result.kind === "draft") {
        this.preview = { requestId, draft: result.draft, source: result.draft.source, sourceFiles: [] };
        this.phase = "ready";
      } else {
        this.phase = "idle";
      }
      return result;
    } catch (error) {
      if (controller.signal.aborted || requestId !== this.requestId || (error as Error).name === "AbortError") return null;
      // Le message reste dans le champ. Un nouvel essai ne doit pas ajouter un
      // deuxième tour identique au contexte transmis à Jev.
      this.turns.length = previousTurnsLength;
      this.phase = "error";
      const stage = (error as Error).message.match(/^assistant_stage:([a-z_]+)$/)?.[1];
      const detail = (error as Error).message.match(/^assistant_detail:([a-z_]+)$/)?.[1];
      const stageLabel: Record<string, string> = {
        cahier: "l’accès à votre Cahier",
        analyse_des_photos: "l’analyse des photos",
        decision: "le choix de la meilleure piste",
        lecture_des_photos: "la lecture des photos",
        generation: "la création de la recette"
      };
      if (error instanceof AssistantImageRequestError) {
        const explanation = error.status === 413
          ? "Une photo est trop volumineuse pour être analysée. Choisissez une version plus légère."
          : error.category === "preparation"
          ? "Je n’ai pas pu préparer vos photos. Essayez de les sélectionner à nouveau."
          : error.category === "network"
            ? "La connexion s’est interrompue pendant l’envoi des photos. Vous pouvez réessayer."
            : error.status === 400
                ? "Je n’ai pas pu lire l’une des photos. Vérifiez son format puis réessayez."
                : error.status === 503
                  ? "Le service d’analyse des photos est momentanément indisponible. Vous pouvez réessayer."
                  : "Je n’ai pas pu terminer l’analyse des photos. Vous pouvez réessayer.";
        this.error = `${explanation} Vos photos sont conservées. Réf. ${error.reference.slice(0, 8)}.`;
        return null;
      }
      this.error = detail
        ? `Je n’ai pas pu joindre le service d’analyse. Vos photos et votre demande sont conservées.`
        : stage
        ? `Je n’ai pas pu terminer ${stageLabel[stage] ?? "cette étape"}. Vos photos et votre demande sont conservées.`
        : "Je n’ai pas pu finaliser cette proposition. Vos photos et votre demande sont intactes : vous pouvez préciser votre envie ou essayer à nouveau.";
      return null;
    } finally {
      if (requestId === this.requestId) this.controller = null;
    }
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    ++this.requestId;
    if (this.phase === "importing" || this.phase === "analyzing" || this.phase === "searching" || this.phase === "creating") this.phase = "idle";
    this.resetConversation();
  }

  closePreview(): void {
    this.cancel();
    this.preview = null;
    this.error = null;
    this.resetConversation();
    this.phase = "idle";
  }
}
