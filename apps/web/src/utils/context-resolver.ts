import type { ChefAgentContextV1 } from "@cookies-et-coquilettes/domain";

export type ChefCurrentThreadTurn = Readonly<{ role: "user" | "assistant"; text: string }>;
export type ChefContextResolution = Readonly<{ kind: "resolved"; context?: ChefAgentContextV1; recentExcerpt?: string }> | Readonly<{ kind: "refused"; reason: "closed_thread" | "forbidden_data" | "limit" }>;
const forbidden = /(?:blob:|data:|\b(?:indexeddb|dexie|file|blob|profile|cahier|prompt|reasoning)\b)/iu;
const bound = (value: string, maximum: number): string => value.trim().slice(0, maximum);

/** Seul propriétaire du contexte: aucun exécuteur ne reçoit le fil Chef brut. */
export class ContextResolver {
  resolve(input: { currentMessage: string; recentThread: readonly ChefCurrentThreadTurn[]; closed?: boolean; context?: ChefAgentContextV1 }): ChefContextResolution {
    if (input.closed) return { kind: "refused", reason: "closed_thread" };
    if (forbidden.test(input.currentMessage)) return { kind: "refused", reason: "forbidden_data" };
    if (input.context && forbidden.test(JSON.stringify(input.context))) return { kind: "refused", reason: "forbidden_data" };
    // Les réponses Chef peuvent contenir une recette entière : elles ne sont
    // jamais réinjectées. Seuls deux courts tours utilisateur précédents sont
    // du contexte factuel, distinct de la demande courante.
    const previousUserTurns = input.recentThread.filter((turn) => turn.role === "user").slice(-2);
    if (previousUserTurns.some((turn) => forbidden.test(turn.text))) return { kind: "refused", reason: "forbidden_data" };
    const recentExcerpt = bound(previousUserTurns.map((turn) => bound(turn.text, 180)).join("\n"), 360);
    return { kind: "resolved", ...(input.context ? { context: input.context } : {}), ...(recentExcerpt ? { recentExcerpt } : {}) };
  }
}
