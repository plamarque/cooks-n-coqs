import assert from "node:assert/strict";
import test from "node:test";
import { CHEF_RUNTIME_LIMITS_V1, chefRuntimeLimitAudit, isChefAgentDecisionV1, isChefAgentDecisionV2, isChefAgentRequestV1, isChefAgentTurnWireV2 } from "../src/chef-agent.js";

const skills = ["chef-core", "adapter-une-recette"];
const tools = ["search-notebook", "assistant-advice", "classify-turn", "get-recipe-context", "prepare-preview"];

test("ChefAgent : le registre annoncé dérive exactement des skills", () => {
  assert.equal(isChefAgentRequestV1({ message: "Adapte", skills, tools }), true);
  assert.equal(isChefAgentRequestV1({ message: "Adapte", skills: [], tools: [] }), false);
  assert.equal(isChefAgentRequestV1({ message: "Adapte", skills, tools: tools.slice(0, -1) }), false);
  assert.equal(isChefAgentRequestV1({ message: "Adapte", skills: ["chef-core", "chef-core"], tools }), false);
});

test("ChefAgent : le contexte de reprise reste borné et sans identifiant local", () => {
  const context = {
    objective: "Des cèpes",
    constraints: ["au Cookeo", "sans crème"],
    clarification: "Quel appareil utilisez-vous ?",
    reference: { title: "Soupe de cèpes" }
  };
  assert.equal(isChefAgentRequestV1({ message: "Au Cookeo et sans crème", skills, tools, context }), true);
  assert.equal(isChefAgentRequestV1({ message: "Au Cookeo", skills, tools, context: { ...context, recipeId: "dexie-local" } }), false);
  assert.equal(isChefAgentRequestV1({ message: "Au Cookeo", skills, tools, context: { reference: { title: "Soupe", id: "dexie-local" } } }), false);
  assert.equal(isChefAgentRequestV1({ message: "Au Cookeo", skills, tools, context: {} }), false);
  assert.equal(isChefAgentRequestV1({ message: "Au Cookeo", skills, tools, context: { constraints: ["sans crème", "Sans crème"] } }), false);
});

test("ChefAgent : chaque tool impose son schéma d’entrée", () => {
  assert.equal(isChefAgentDecisionV1({ kind: "tool", tool: "get-recipe-context", input: { query: "soupe" } }), false);
  assert.equal(isChefAgentDecisionV1({ kind: "tool", tool: "get-recipe-context", input: {} }), true);
  assert.equal(isChefAgentDecisionV1({ kind: "tool", tool: "classify-turn", input: { request: "Adapte" } }), false);
  assert.equal(isChefAgentDecisionV1({ kind: "tool", tool: "classify-turn", input: { message: "Adapte" } }), true);
});

test("ChefAgent V2 : le wire ferme révision, nonce, projection et résultats", () => {
  const wire = { catalogRevision: "chef-catalog-v1-09170f6ee3cb4ddc", nonce: "nonce_temporaire_1234", step: 0, activeSkills: ["chef-core"], projection: { message: "Sans crème", recentExcerpt: "Je cuisine une sauce", context: { objective: "une sauce" } } };
  assert.equal(isChefAgentTurnWireV2(wire), true);
  assert.equal(isChefAgentTurnWireV2({ ...wire, recipeId: "dexie-local" }), false);
  assert.equal(isChefAgentTurnWireV2({ ...wire, projection: { message: "blob:https://local/secret" } }), false);
  assert.equal(isChefAgentTurnWireV2({ ...wire, step: CHEF_RUNTIME_LIMITS_V1.maxSteps }), false);
});

test("ChefAgent V2 : les limites produisent seulement un audit redacted", () => {
  assert.equal(chefRuntimeLimitAudit("revision", 1, "maxResultChars", 100, "truncate"), null);
  assert.deepEqual(chefRuntimeLimitAudit("revision", 1, "maxResultChars", 960, "truncate"), { catalogRevision: "revision", step: 1, key: "maxResultChars", configured: 1200, observed: 960, action: "truncate", outcome: "limit_high_water" });
  assert.deepEqual(chefRuntimeLimitAudit("revision", 1, "maxResultChars", 1201, "fallback"), { catalogRevision: "revision", step: 1, key: "maxResultChars", configured: 1200, observed: 1201, action: "fallback", outcome: "limit_enforced" });
});

test("ChefAgent V2 : une finale ne peut pas renvoyer d'identifiant ou de secret brut", () => {
  assert.equal(isChefAgentDecisionV2({ kind: "final", output: "advice", text: "Ajoutez du thym." }), true);
  assert.equal(isChefAgentDecisionV2({ kind: "final", output: "advice", text: "recipeId: dexie-local" }), false);
  assert.equal(isChefAgentDecisionV2({ kind: "final", output: "advice", text: "secretToken supersecretvalue" }), false);
});
