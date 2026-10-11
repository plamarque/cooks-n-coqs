import assert from "node:assert/strict";
import test from "node:test";
import { restoreChefIdeasFromTurns, restoreChefNoCandidateTurnIds, routeChefIntent, routeChefIntentForRequest, runChefIntentOutcome } from "../src/utils/chef-intent-router";

const classification = (intent: "idea" | "search" | "create" | "adapt" | "variant") => ({ intent, confidence: "high" as const, constraints: [] });

test("route les trois intentions 9.2 sans fallback vers une création", () => {
  assert.equal(routeChefIntent(classification("idea")), "idea");
  assert.equal(routeChefIntent(classification("search")), "search");
  assert.equal(routeChefIntent(classification("create")), "create");
  assert.equal(routeChefIntent(classification("adapt")), "advice");
  assert.equal(routeChefIntent({ ...classification("create"), missing: { field: "occasion", question: "Pour combien ?" } }), "advice");
});

test("une création photo explicite corrige seulement le faux négatif search du classifieur", () => {
  assert.equal(routeChefIntentForRequest(classification("search"), "Crée une recette avec ce que tu vois sur la photo.", true), "create");
  assert.equal(routeChefIntentForRequest({ ...classification("search"), missing: { field: "ingredients", question: "Quels ingrédients ?" } }, "Crée une recette avec ce que tu vois sur la photo.", true), "create");
  assert.equal(routeChefIntentForRequest(classification("search"), "Retrouve dans mon Cahier une recette avec ces ingrédients.", true), "search");
  assert.equal(routeChefIntentForRequest(classification("search"), "Crée une recette de lentilles.", false), "search");
});

test("orchestration 9.2 : pistes temporaires, recherche sans preview, création volatile", async () => {
  let ideasCalls = 0;
  let previewCalls = 0;
  let searchCalls = 0;
  let recipeWrites = 0;
  const handlers = {
    ideas: async () => { ideasCalls += 1; return [{ title: "Tarte fine", description: "Pommes et cannelle." }]; },
    create: async () => { previewCalls += 1; return { draft: { title: "Crumble" }, persist: () => { recipeWrites += 1; } }; },
    search: async () => { searchCalls += 1; return { kind: "noCandidate" as const }; }
  };

  const idea = await runChefIntentOutcome("idea", handlers);
  assert.deepEqual(idea, { kind: "ideas", ideas: [{ title: "Tarte fine", description: "Pommes et cannelle." }] });
  assert.equal(previewCalls, 0);
  assert.equal(searchCalls, 0, "une idée ne démarre pas la sélection Cahier");
  assert.equal(recipeWrites, 0);

  const search = await runChefIntentOutcome("search", handlers);
  assert.deepEqual(search, { kind: "search", result: { kind: "noCandidate" } });
  assert.equal(ideasCalls, 1);
  assert.equal(searchCalls, 1);
  assert.equal(previewCalls, 0);
  assert.equal(recipeWrites, 0);

  const create = await runChefIntentOutcome("create", handlers);
  assert.equal(create.kind, "preview");
  assert.equal(previewCalls, 1);
  assert.equal(recipeWrites, 0, "la création ne persiste rien avant Sauvegarder");
  assert.equal(searchCalls, 1, "une création ne démarre pas la sélection Cahier");
});

test("reprise 9.2 : les pistes textuelles retrouvent leur structure", () => {
  assert.deepEqual(restoreChefIdeasFromTurns([
    { id: "ideas", role: "assistant", text: "1. Poêlée — Champignons et ail.\n2. Risotto — Bouillon et parmesan.\n\nDites-moi quelle piste vous attire pour la préciser." },
    { id: "plain", role: "assistant", text: "Voici un conseil sans piste." }
  ]), {
    ideas: [
      { title: "Poêlée", description: "Champignons et ail." },
      { title: "Risotto", description: "Bouillon et parmesan." }
    ]
  });
});

test("reprise 9.2 : un refus Cahier retrouve ses actions locales", () => {
  assert.deepEqual([...restoreChefNoCandidateTurnIds([
    { id: "no-candidate", role: "assistant", text: "Je n’ai trouvé aucune recette correspondante dans votre Cahier. Vous pouvez l’ouvrir ou préciser votre demande." },
    { id: "other", role: "assistant", text: "Autre réponse." }
  ])], ["no-candidate"]);
});
