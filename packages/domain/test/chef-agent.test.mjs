import assert from "node:assert/strict";
import test from "node:test";
import { isChefAgentDecisionV1, isChefAgentRequestV1 } from "../src/chef-agent.js";

const skills = ["chef-core", "adapter-une-recette"];
const tools = ["search-notebook", "assistant-advice", "classify-turn", "get-recipe-context", "prepare-preview"];

test("ChefAgent : le registre annoncé dérive exactement des skills", () => {
  assert.equal(isChefAgentRequestV1({ message: "Adapte", skills, tools }), true);
  assert.equal(isChefAgentRequestV1({ message: "Adapte", skills: [], tools: [] }), false);
  assert.equal(isChefAgentRequestV1({ message: "Adapte", skills, tools: tools.slice(0, -1) }), false);
  assert.equal(isChefAgentRequestV1({ message: "Adapte", skills: ["chef-core", "chef-core"], tools }), false);
});

test("ChefAgent : chaque tool impose son schéma d’entrée", () => {
  assert.equal(isChefAgentDecisionV1({ kind: "tool", tool: "get-recipe-context", input: { query: "soupe" } }), false);
  assert.equal(isChefAgentDecisionV1({ kind: "tool", tool: "get-recipe-context", input: {} }), true);
  assert.equal(isChefAgentDecisionV1({ kind: "tool", tool: "classify-turn", input: { request: "Adapte" } }), false);
  assert.equal(isChefAgentDecisionV1({ kind: "tool", tool: "classify-turn", input: { message: "Adapte" } }), true);
});
