import type { ChefAgentFinalV1 } from "@cookies-et-coquilettes/domain";
import type { ChefIdea } from "./chef-intent-router";

/** Une envie libre n'est pas encore une sortie UI : le service 9.2 choisit
 * ensuite entre idées, conseil et recette. ChefAgent ne doit pas figer ce
 * choix avant d'avoir reçu ce résultat typé. */
export function preserveChef92Outcome(final: ChefAgentFinalV1): ChefAgentFinalV1 {
  return final.output === "ideas" ? { kind: "final", output: "advice" } : final;
}

/** Adaptateur UI : les finales agentiques réemploient exactement les sorties 9.2. */
export async function runChefAgentOutcome<TPreview, TSearch>(
  final: ChefAgentFinalV1,
  handlers: { ideas: () => Promise<readonly ChefIdea[]>; create: () => Promise<TPreview>; search: () => Promise<TSearch>; advice: () => Promise<void>; clarify: (question: string) => Promise<void> }
): Promise<{ kind: "ideas"; ideas: readonly ChefIdea[] } | { kind: "search"; result: TSearch } | { kind: "preview"; preview: TPreview } | { kind: "advice" } | { kind: "clarify" }> {
  if (final.output === "ideas") return { kind: "ideas", ideas: await handlers.ideas() };
  if (final.output === "search") return { kind: "search", result: await handlers.search() };
  if (final.output === "preview") return { kind: "preview", preview: await handlers.create() };
  if (final.output === "clarify") { await handlers.clarify(final.text ?? "Pouvez-vous préciser ?"); return { kind: "clarify" }; }
  await handlers.advice(); return { kind: "advice" };
}
