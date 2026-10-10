import type { AssistantConversationTurnV1, ChefTurnClassificationContextV1, ChefTurnClassificationV1, ChefTurnClassificationWireV1, ChefTurnReferenceV1 } from "@cookies-et-coquilettes/domain";

type Card = NonNullable<AssistantConversationTurnV1["cards"]>[number];

/**
 * Projette uniquement le contexte textuel temporaire. Les cartes restent sur
 * l'appareil : leur titre sert seulement à résoudre une référence locale.
 */
export function buildChefTurnClassificationContext(turns: readonly AssistantConversationTurnV1[], openClarification: string | null, candidateTitles = new Map<string, string>(), currentMessage?: string): ChefTurnClassificationContextV1 | undefined {
  const previousUser = [...turns].reverse().find((turn) => turn.role === "user" && turn.text.trim());
  const constraints = uniqueConstraints(turns);
  const reference = resolveChefTurnReference(turns, openClarification, candidateTitles, currentMessage);
  const context: ChefTurnClassificationContextV1 = {
    ...(previousUser ? { objective: previousUser.text.slice(0, 500) } : {}),
    ...(constraints.length ? { constraints } : {}),
    ...(openClarification ? { clarification: openClarification.slice(0, 240) } : {}),
    ...(reference ? { reference: { title: reference.title } } : {})
  };
  return Object.keys(context).length ? context : undefined;
}

export function resolveChefTurnReference(turns: readonly AssistantConversationTurnV1[], openClarification: string | null, candidateTitles = new Map<string, string>(), currentMessage?: string): ChefTurnReferenceV1 | undefined {
  if (openClarification) {
    const title = latestCardTitle(turns, candidateTitles);
    if (title) return { title, source: "clarification" };
  }
  const currentTitle = currentMessage ? mentionedRecipeTitle(currentMessage, candidateTitles) : undefined;
  if (currentTitle) return { title: currentTitle, source: "mentioned_recipe" };
  const mentioned = [...turns].reverse().find((turn) => turn.role === "user" && mentionedRecipeTitle(turn.text, candidateTitles));
  if (mentioned) {
    const title = mentionedRecipeTitle(mentioned.text, candidateTitles);
    if (title) return { title, source: "mentioned_recipe" };
  }
  const title = latestCardTitle(turns, candidateTitles);
  return title ? { title, source: "latest_card" } : undefined;
}

function mentionedRecipeTitle(text: string, candidateTitles: ReadonlyMap<string, string>): string | undefined {
  const normalizedText = normalizeForMatch(text);
  return [...candidateTitles.values()]
    .map((title) => title.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .find((title) => normalizedText.includes(normalizeForMatch(title)));
}

function normalizeForMatch(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr-FR");
}

export function resolveChefTurnClassification(wire: ChefTurnClassificationWireV1, turns: readonly AssistantConversationTurnV1[], openClarification: string | null, candidateTitles = new Map<string, string>(), currentMessage?: string): ChefTurnClassificationV1 {
  const reference = resolveChefTurnReference(turns, openClarification, candidateTitles, currentMessage);
  return { ...wire, ...(reference ? { reference } : {}) };
}

function latestCardTitle(turns: readonly AssistantConversationTurnV1[], candidateTitles: ReadonlyMap<string, string>): string | undefined {
  for (const turn of [...turns].reverse()) {
    const card = [...(turn.cards ?? [])].reverse().find((candidate): candidate is Card => candidate.kind === "candidate" || candidate.kind === "preview");
    if (!card) continue;
    const title = card.kind === "candidate" ? candidateTitles.get(card.recipeId) : card.preview.draft.title;
    if (title?.trim()) return title.trim().slice(0, 180);
  }
  return undefined;
}

function uniqueConstraints(turns: readonly AssistantConversationTurnV1[]): string[] {
  const result: string[] = [];
  for (const turn of turns) {
    if (turn.role !== "user") continue;
    for (const part of turn.text.split(/[,;\n]/).map((value) => value.trim()).filter(Boolean)) {
      if (part.length <= 180 && !result.includes(part)) result.push(part);
      if (result.length === 12) return result;
    }
  }
  return result;
}
