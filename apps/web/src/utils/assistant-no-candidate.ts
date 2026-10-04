import type { AssistantConversationTurnV1, ParsedRecipeDraft } from "@cookies-et-coquilettes/domain";
import type { AssistantImportRoute } from "./assistant-session";

export async function createNoCandidateAssistantPreview(options: {
  route: AssistantImportRoute;
  selectionRequest: string;
  sourceFiles: File[];
  turns: AssistantConversationTurnV1[];
  signal: AbortSignal;
  creating: () => void;
  generate: (request: string, signal: AbortSignal, turns: AssistantConversationTurnV1[]) => Promise<ParsedRecipeDraft>;
  capturedAt?: () => string;
}): Promise<{ draft: ParsedRecipeDraft; sourceFiles: File[] }> {
  options.creating();
  const draft = await options.generate(options.selectionRequest, options.signal, options.turns);
  return {
    draft: {
      ...draft,
      source: {
        type: options.route === "image" ? "SCREENSHOT" : "TEXT",
        capturedAt: (options.capturedAt ?? (() => new Date().toISOString()))()
      }
    },
    // Les originaux restent associés à la preview ; les copies préparées ne
    // servent qu'au transfert temporaire vers le BFF.
    sourceFiles: options.sourceFiles
  };
}
