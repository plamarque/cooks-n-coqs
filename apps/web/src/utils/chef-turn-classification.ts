import type { AssistantConversationTurnV1, ChefTurnClassificationContextV1, ChefTurnClassificationV1, ChefTurnClassificationWireV1, ChefTurnReferenceV1 } from "@cookies-et-coquilettes/domain";

type Card = NonNullable<AssistantConversationTurnV1["cards"]>[number];

/**
 * Filet de continuité local : le raisonneur reste la décision principale,
 * mais les formulations usuelles qui demandent la fiche d'une piste déjà
 * discutée ne doivent pas dépendre du seul verbe « générer ».
 */
export function requestsRecipePreview(text: string): boolean {
  return /\b(?:montre(?:[- ]moi)?|donne(?:[- ]moi)?|[ée]cris(?:[- ]moi)?|je veux|j['’]aimerais|on peut avoir)\b[^.\n]{0,80}\b(?:la |une )?(?:recette|fiche|version d[ée]taill[ée]e|[ée]tapes)\b/iu.test(text);
}

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
  if (title) return { title, source: "latest_card" };
  // « génère-la » peut désigner la dernière variation textuelle du Chef,
  // avant qu'elle ne devienne une carte. La transmettre comme référence
  // temporaire évite une question artificielle au tour suivant.
  if (currentMessage && /(?:g[ée]n[èe]re|recette)/iu.test(currentMessage)) {
    const suggestion = [...turns].reverse().find((turn) => turn.role === "assistant" && turn.text.trim());
    if (suggestion) return { title: suggestion.text.trim().slice(0, 180), source: "latest_card" };
  }
  return undefined;
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
  // Le BFF ne reçoit qu'un titre temporaire et peut légitimement demander une
  // référence. Dès que la PWA l'a résolue dans une carte locale, cette donnée
  // n'est plus manquante : ne pas poser une question contradictoire.
  if (reference && wire.missing?.field === "reference") {
    const { missing: _missing, ...classification } = wire;
    return { ...classification, reference };
  }
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
