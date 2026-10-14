import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileChefCatalog, loadChefCatalogSources } from "../../../packages/chef-catalog/src/compile.ts";
import { CHEF_CATALOG } from "../../../packages/chef-catalog/src/generated/catalog.ts";

test("le catalogue compilé est déterministe et sa révision est fraîche", () => {
  assert.equal(compileChefCatalog(CHEF_CATALOG).catalogRevision, CHEF_CATALOG.catalogRevision);
});

test("le compilateur lit chaque SKILL, TOOL et les deux schémas de chaque tool", () => {
  const source = loadChefCatalogSources(fileURLToPath(new URL("../../../packages/chef-catalog", import.meta.url)));
  const compiled = compileChefCatalog(source);
  assert.deepEqual(compiled.tools.map(({ id }) => id), ["assistant-advice", "classify-turn", "get-recipe-context", "prepare-preview", "search-notebook"]);
  assert.ok(compiled.tools.every((tool) => Object.keys(tool.inputSchema).length > 0 && Object.keys(tool.resultSchema).length > 0));
  assert.equal(compiled.catalogRevision, CHEF_CATALOG.catalogRevision);
});

test("le compilateur rejette une allow-list qui tente d'exposer un identifiant local", () => {
  const invalid = structuredClone(CHEF_CATALOG);
  const tool = invalid.tools.find(({ id }) => id === "search-notebook");
  assert.ok(tool);
  (tool.inputSchema.properties as Record<string, unknown>).recipeId = { type: "string" };
  assert.throws(() => compileChefCatalog(invalid), /champ interdit/);
});

test("le compilateur inspecte les branches JSON Schema et l'appartenance de chaque tool", () => {
  const nested = structuredClone(CHEF_CATALOG);
  const nestedTool = nested.tools.find(({ id }) => id === "search-notebook");
  assert.ok(nestedTool);
  nestedTool.inputSchema.$defs = { hidden: { allOf: [{ type: "object", properties: { candidateId: { type: "string" } } }] } };
  assert.throws(() => compileChefCatalog(nested), /champ interdit/);

  const ownership = structuredClone(CHEF_CATALOG);
  const core = ownership.skills.find(({ id }) => id === "chef-core");
  assert.ok(core);
  core.toolIds = core.toolIds.filter((toolId) => toolId !== "search-notebook");
  assert.throws(() => compileChefCatalog(ownership), /allow-list incomplète/);
});
