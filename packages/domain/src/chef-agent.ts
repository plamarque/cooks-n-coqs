/** Contrat fermé du tour agentique: le modèle propose, le client autorise. */
export const CHEF_AGENT_MAX_STEPS = 6;
/** Les tools suivent la progression, sans plafond distinct arbitraire. */
export const CHEF_AGENT_MAX_TOOLS = CHEF_AGENT_MAX_STEPS;
export const CHEF_AGENT_MESSAGE_MAX_LENGTH = 2_600;
export type ChefSkillIdV1 = "chef-core" | "adapter-une-recette";
export type ChefMcpToolNameV1 = "search-notebook" | "get-recipe-context" | "prepare-preview" | "assistant-advice" | "assistant-recipe" | "classify-turn";
export type ChefAgentToolInputV1 = { query: string } | { referenceTitle?: string } | { request: string } | { message: string; context?: string };
export type ChefAgentToolResultV1 = { titles: string[] } | { recipe: { title: string; ingredients: string[]; steps: string[] } } | { prepared: true } | { text: string } | { intent: string; constraints: string[] };
export type ChefAgentToolCallV1 = { kind: "tool"; tool: ChefMcpToolNameV1; input: ChefAgentToolInputV1 };
export type ChefAgentFinalV1 = { kind: "final"; output: "ideas" | "search" | "preview" | "advice" | "clarify"; text?: string; createVariant?: boolean };
export type ChefAgentDecisionV1 = ChefAgentToolCallV1 | ChefAgentFinalV1;
export type ChefAgentRequestV1 = { message: string; skills: ChefSkillIdV1[]; tools: ChefMcpToolNameV1[]; results?: Array<{ tool: ChefMcpToolNameV1; result: ChefAgentToolResultV1 }> };

const skills: readonly ChefSkillIdV1[] = ["chef-core", "adapter-une-recette"];
const tools: readonly ChefMcpToolNameV1[] = ["search-notebook", "get-recipe-context", "prepare-preview", "assistant-advice", "assistant-recipe", "classify-turn"];
const isText = (value: unknown, max: number): value is string => typeof value === "string" && !!value.trim() && value.trim().length <= max;
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const closed = (value: Record<string, unknown>, names: readonly string[]) => Object.keys(value).every((key) => names.includes(key));
const safeStrings = (value: unknown, maximum: number, itemMaximum: number): value is string[] => Array.isArray(value) && value.length <= maximum && value.every((item) => isText(item, itemMaximum));
const input = (value: unknown): value is ChefAgentToolInputV1 => isObject(value) && ((closed(value, ["query"]) && isText(value.query, 2_600)) || (closed(value, ["referenceTitle"]) && (value.referenceTitle === undefined || isText(value.referenceTitle, 180))) || (closed(value, ["request"]) && isText(value.request, 2_600)) || (closed(value, ["message", "context"]) && isText(value.message, 2_600) && (value.context === undefined || isText(value.context, 2_000))));
export function isChefAgentToolInputForTool(tool: ChefMcpToolNameV1, value: unknown): value is ChefAgentToolInputV1 {
  if (!input(value)) return false;
  if (tool === "search-notebook") return "query" in value;
  if (tool === "get-recipe-context") return Object.keys(value).every((key) => key === "referenceTitle");
  if (tool === "prepare-preview" || tool === "assistant-advice" || tool === "assistant-recipe") return "request" in value;
  return "message" in value;
}
const result = (value: unknown): value is ChefAgentToolResultV1 => isObject(value) && ((closed(value, ["titles"]) && safeStrings(value.titles, 3, 180)) || (closed(value, ["recipe"]) && isObject(value.recipe) && closed(value.recipe, ["title", "ingredients", "steps"]) && isText(value.recipe.title, 180) && safeStrings(value.recipe.ingredients, 16, 180) && safeStrings(value.recipe.steps, 8, 500)) || (closed(value, ["prepared"]) && value.prepared === true) || (closed(value, ["text"]) && isText(value.text, 600)) || (closed(value, ["intent", "constraints"]) && isText(value.intent, 20) && safeStrings(value.constraints, 12, 180)));

export function isChefAgentRequestV1(value: unknown): value is ChefAgentRequestV1 {
  if (!isObject(value) || !closed(value, ["message", "skills", "tools", "results"]) || !isText(value.message, CHEF_AGENT_MESSAGE_MAX_LENGTH)) return false;
  if (!Array.isArray(value.skills) || !value.skills.length || new Set(value.skills).size !== value.skills.length || !value.skills.every((skill) => skills.includes(skill as ChefSkillIdV1))) return false;
  const expectedTools = new Set(value.skills.flatMap((skill) => skill === "chef-core" ? ["search-notebook", "assistant-advice", "classify-turn"] : ["get-recipe-context", "prepare-preview", "assistant-advice"]));
  if (!Array.isArray(value.tools) || value.tools.length !== expectedTools.size || new Set(value.tools).size !== value.tools.length || !value.tools.every((tool) => expectedTools.has(tool))) return false;
  return value.results === undefined || Array.isArray(value.results) && value.results.length <= CHEF_AGENT_MAX_TOOLS && value.results.every((entry) => isObject(entry) && closed(entry, ["tool", "result"]) && tools.includes(entry.tool as ChefMcpToolNameV1) && result(entry.result));
}

export function isChefAgentDecisionV1(value: unknown): value is ChefAgentDecisionV1 {
  if (!isObject(value) || typeof value.kind !== "string") return false;
  if (value.kind === "tool") return closed(value, ["kind", "tool", "input"]) && tools.includes(value.tool as ChefMcpToolNameV1) && isChefAgentToolInputForTool(value.tool as ChefMcpToolNameV1, value.input);
  return value.kind === "final" && closed(value, ["kind", "output", "text", "createVariant"])
    && ["ideas", "search", "preview", "advice", "clarify"].includes(value.output as string)
    && (value.text === undefined || isText(value.text, 600))
    && (value.createVariant === undefined || typeof value.createVariant === "boolean");
}
