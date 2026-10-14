import Ajv2020 from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CHEF_CATALOG_EFFECTS, type ChefCatalogManifest } from "./types";

const denied = (property: string): boolean => ["id", "file", "blob", "binary", "profile", "memory", "prompt", "reasoning", "endpoint", "url"].some((token) => property.toLocaleLowerCase("en-US").includes(token));
const schemaProperties = (schema: unknown): string[] => {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const record = schema as Record<string, unknown>;
  const properties = record.properties && typeof record.properties === "object" && !Array.isArray(record.properties) ? record.properties as Record<string, unknown> : {};
  const propertyMaps = [record.patternProperties]
    .filter((value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value));
  // Les noms de $defs ne sont pas des champs exposés. En revanche, il faut
  // parcourir toutes leurs branches afin de contrôler les `properties` qu'ils
  // contiennent, même quand ils ne sont atteints qu'à travers un allOf/oneOf.
  const schemaMaps = [record.$defs, record.definitions, record.dependentSchemas, record.dependencies]
    .filter((value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value));
  const branches = [record.items, record.additionalItems, record.contains, record.contentSchema, record.if, record.then, record.else, record.not, record.additionalProperties, record.unevaluatedProperties, record.unevaluatedItems, record.propertyNames, ...(Array.isArray(record.allOf) ? record.allOf : []), ...(Array.isArray(record.anyOf) ? record.anyOf : []), ...(Array.isArray(record.oneOf) ? record.oneOf : []), ...(Array.isArray(record.prefixItems) ? record.prefixItems : [])];
  return Object.entries(properties).flatMap(([name, child]) => [name, ...schemaProperties(child)])
    .concat(propertyMaps.flatMap((entries) => Object.entries(entries).flatMap(([name, child]) => [name, ...schemaProperties(child)])))
    .concat(schemaMaps.flatMap((entries) => Object.values(entries).flatMap(schemaProperties)))
    .concat(branches.flatMap(schemaProperties));
};

/** Vérifie les invariants avant qu'une capacité ne soit importée par un runtime. */
export function compileChefCatalog(source: ChefCatalogManifest): ChefCatalogManifest {
  const skillIds = new Set<string>();
  const toolIds = new Set<string>();
  const skills = new Map(source.skills.map((skill) => [skill.id, skill]));
  const ajv = new Ajv2020({ strict: true });
  for (const skill of source.skills) {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(skill.id) || skillIds.has(skill.id)) throw new Error(`catalogue: skill invalide ${skill.id}`);
    skillIds.add(skill.id);
    if (!skill.summary.trim() || !skill.instructions.trim()) throw new Error(`catalogue: skill vide ${skill.id}`);
    if (skill.dependencies.some((dependency) => !skills.has(dependency))) throw new Error(`catalogue: dépendance inconnue ${skill.id}`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`catalogue: cycle ${id}`);
    if (visited.has(id)) return;
    visiting.add(id); skills.get(id)?.dependencies.forEach(visit); visiting.delete(id); visited.add(id);
  };
  source.skills.forEach((skill) => visit(skill.id));
  for (const tool of source.tools) {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(tool.id) || toolIds.has(tool.id) || !skills.has(tool.skillId)) throw new Error(`catalogue: tool invalide ${tool.id}`);
    if (!CHEF_CATALOG_EFFECTS.includes(tool.effect) || !["local", "bff"].includes(tool.executor)) throw new Error(`catalogue: politique invalide ${tool.id}`);
    const properties = [tool.inputSchema, tool.resultSchema].flatMap(schemaProperties);
    if (properties.some(denied)) throw new Error(`catalogue: champ interdit ${tool.id}`);
    try { ajv.compile(tool.inputSchema); ajv.compile(tool.resultSchema); } catch { throw new Error(`catalogue: schéma invalide ${tool.id}`); }
    toolIds.add(tool.id);
  }
  for (const skill of source.skills) {
    if (skill.toolIds.some((toolId) => !toolIds.has(toolId) || source.tools.find((tool) => tool.id === toolId)?.skillId !== skill.id)) throw new Error(`catalogue: allow-list invalide ${skill.id}`);
    if (source.tools.some((tool) => tool.skillId === skill.id && !skill.toolIds.includes(tool.id))) throw new Error(`catalogue: allow-list incomplète ${skill.id}`);
  }
  const revision = createHash("sha256").update(JSON.stringify({ skills: source.skills, tools: source.tools })).digest("hex").slice(0, 16);
  return Object.freeze({ ...source, catalogRevision: `chef-catalog-v1-${revision}` });
}

const frontmatter = (path: string): Record<string, unknown> => {
  const source = readFileSync(path, "utf8"); const match = source.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`catalogue: frontmatter manquant ${path}`);
  return Object.fromEntries(match[1].split("\n").map((line) => line.split(/:\s*/, 2)).filter(([key, value]) => key && value).map(([key, value]) => [key, value!.startsWith("[") ? value!.replace(/^\[|\]$/g, "").split(",").map((entry) => entry.trim()).filter(Boolean) : value!.trim()]));
};
const text = (value: unknown, field: string): string => { if (typeof value !== "string" || !value.trim()) throw new Error(`catalogue: ${field} manquant`); return value.trim(); };
const array = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];

/** Charge exhaustivement les manifests et schémas locaux, sans téléchargement runtime. */
export function loadChefCatalogSources(root: string): ChefCatalogManifest {
  const skillRoot = join(root, "skills"); const toolRoot = join(root, "tools");
  const skills = readdirSync(skillRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => {
    const file = join(skillRoot, entry.name, "SKILL.md"); const meta = frontmatter(file); const instructions = readFileSync(file, "utf8").replace(/^---[\s\S]*?---\n?/, "").trim();
    return { id: text(meta.id, "skill id"), dependencies: array(meta.dependencies), summary: text(meta.summary, "skill summary"), instructions, toolIds: [] as string[] };
  });
  const tools = readdirSync(toolRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => {
    const directory = join(toolRoot, entry.name); const meta = frontmatter(join(directory, "TOOL.md"));
    return { id: text(meta.id, "tool id"), skillId: text(meta.skillId, "tool skillId"), executor: text(meta.executor, "tool executor") as "local" | "bff", effect: text(meta.effect, "tool effect") as ChefCatalogManifest["tools"][number]["effect"], inputSchema: JSON.parse(readFileSync(join(directory, "input.schema.json"), "utf8")), resultSchema: JSON.parse(readFileSync(join(directory, "result.schema.json"), "utf8")) };
  });
  const idsBySkill = new Map(skills.map((skill) => [skill.id, [] as string[]])); tools.forEach((tool) => idsBySkill.get(tool.skillId)?.push(tool.id));
  return { catalogRevision: "uncompiled", skills: skills.map((skill) => ({ ...skill, toolIds: idsBySkill.get(skill.id) ?? [] })), tools };
}
