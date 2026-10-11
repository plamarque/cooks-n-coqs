import type { ChefTurnClassificationV1 } from "@cookies-et-coquilettes/domain";

/** Décision pure : le routage ne fait ni I/O, ni écriture locale. */
export type ChefIntentRoute = "idea" | "search" | "create" | "advice";
export type ChefIdea = { title: string; description: string };

/**
 * Les pistes sont affichées richement dans le fil courant, mais le journal
 * local conserve volontairement des tours texte. Cette lecture du format
 * produit par le Chef rend à nouveau ces tours riches après une reprise,
 * sans migrer ni modifier les journaux déjà enregistrés.
 */
export function restoreChefIdeasFromTurns(
  turns: readonly { id?: string; role: string; text: string }[]
): Record<string, readonly ChefIdea[]> {
  const restored: Record<string, readonly ChefIdea[]> = {};
  for (const turn of turns) {
    if (turn.role !== "assistant" || !turn.id) continue;
    const [numberedIdeas, prompt] = turn.text.split("\n\n");
    if (!prompt || !/^(Dites-moi|Choisissez) /u.test(prompt)) continue;
    const ideas = numberedIdeas.split("\n").map((line, index) => {
      const match = new RegExp(`^${index + 1}\\. (.+?) — (.+)$`, "u").exec(line);
      return match ? { title: match[1], description: match[2] } : null;
    });
    if (ideas.length && ideas.every((idea): idea is ChefIdea => idea !== null)) restored[turn.id] = ideas;
  }
  return restored;
}

/** Rétablit les actions locales d'un refus Cahier après reprise du fil. */
export function restoreChefNoCandidateTurnIds(
  turns: readonly { id?: string; role: string; text: string }[]
): Set<string> {
  return new Set(turns.flatMap((turn) =>
    turn.role === "assistant" && turn.id && turn.text === "Je n’ai trouvé aucune recette correspondante dans votre Cahier. Vous pouvez l’ouvrir ou préciser votre demande."
      ? [turn.id]
      : []
  ));
}

/**
 * Orchestration minimale testable des sorties 9.2. Les callbacks restent
 * propriétaires de leurs I/O; ce helper interdit simplement les fallbacks
 * entre recherche et création.
 */
export async function runChefIntentOutcome<TPreview, TSearch>(
  route: ChefIntentRoute,
  handlers: { ideas: () => Promise<readonly ChefIdea[]>; create: () => Promise<TPreview>; search: () => Promise<TSearch> }
): Promise<{ kind: "ideas"; ideas: readonly ChefIdea[] } | { kind: "search"; result: TSearch } | { kind: "preview"; preview: TPreview } | { kind: "advice" }> {
  if (route === "idea") return { kind: "ideas", ideas: await handlers.ideas() };
  if (route === "create") return { kind: "preview", preview: await handlers.create() };
  if (route === "search") return { kind: "search", result: await handlers.search() };
  return { kind: "advice" };
}

export function routeChefIntent(classification: ChefTurnClassificationV1): ChefIntentRoute {
  if (classification.missing) return "advice";
  if (classification.intent === "idea") return "idea";
  if (classification.intent === "search") return "search";
  if (classification.intent === "create") return "create";
  return "advice";
}

/**
 * Une photo ne donne pas son binaire au classifieur. Celui-ci peut donc
 * exceptionnellement confondre une demande de création pourtant explicite
 * avec une recherche. Le texte local ne corrige que ce faux négatif précis :
 * une demande de recherche explicite reste toujours bornée au Cahier.
 */
export function routeChefIntentForRequest(
  classification: ChefTurnClassificationV1,
  request: string,
  hasImages: boolean
): ChefIntentRoute {
  const route = routeChefIntent(classification);
  const explicitCreation = /\b(?:cr[ée]e|g[ée]n[èe]re|fais|fabrique|propose)\b[\s\S]{0,80}\b(?:une?\s+)?(?:recette|plat)\b/iu.test(request);
  // Une photo est précisément la donnée qui lève l'ambiguïté que le
  // classifieur ne peut pas résoudre sans son binaire. La création explicite
  // supplante donc son faux `search` ou `missing`, mais jamais une recherche.
  if (hasImages && explicitCreation && (route === "search" || classification.missing)) return "create";
  return route;
}
