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
/** Contexte de reprise déjà réduit côté client : jamais d'identifiant local ou de contenu Cahier complet. */
export type ChefAgentContextV1 = { objective?: string; constraints?: string[]; clarification?: string; reference?: { title: string } };
export type ChefAgentRequestV1 = { message: string; skills: ChefSkillIdV1[]; tools: ChefMcpToolNameV1[]; context?: ChefAgentContextV1; results?: Array<{ tool: ChefMcpToolNameV1; result: ChefAgentToolResultV1 }> };

const skills: readonly ChefSkillIdV1[] = ["chef-core", "adapter-une-recette"];
const tools: readonly ChefMcpToolNameV1[] = ["search-notebook", "get-recipe-context", "prepare-preview", "assistant-advice", "assistant-recipe", "classify-turn"];
const isText = (value: unknown, max: number): value is string => typeof value === "string" && !!value.trim() && value.trim().length <= max;
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const closed = (value: Record<string, unknown>, names: readonly string[]) => Object.keys(value).every((key) => names.includes(key));
const safeStrings = (value: unknown, maximum: number, itemMaximum: number): value is string[] => Array.isArray(value) && value.length <= maximum && value.every((item) => isText(item, itemMaximum));
const uniqueText = (values: readonly string[]): boolean => new Set(values.map((value) => value.trim().toLocaleLowerCase("fr-FR"))).size === values.length;
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
  if (!isObject(value) || !closed(value, ["message", "skills", "tools", "context", "results"]) || !isText(value.message, CHEF_AGENT_MESSAGE_MAX_LENGTH)) return false;
  if (!Array.isArray(value.skills) || !value.skills.length || new Set(value.skills).size !== value.skills.length || !value.skills.every((skill) => skills.includes(skill as ChefSkillIdV1))) return false;
  const expectedTools = new Set(value.skills.flatMap((skill) => skill === "chef-core" ? ["search-notebook", "assistant-advice", "classify-turn"] : ["get-recipe-context", "prepare-preview", "assistant-advice"]));
  if (!Array.isArray(value.tools) || value.tools.length !== expectedTools.size || new Set(value.tools).size !== value.tools.length || !value.tools.every((tool) => expectedTools.has(tool))) return false;
  const context = value.context;
  const validContext = context === undefined || isObject(context) && Object.keys(context).length > 0 && closed(context, ["objective", "constraints", "clarification", "reference"])
    && (context.objective === undefined || isText(context.objective, 500))
    && (context.clarification === undefined || isText(context.clarification, 240))
    && (context.constraints === undefined || safeStrings(context.constraints, 12, 180) && uniqueText(context.constraints))
    && (context.reference === undefined || isObject(context.reference) && closed(context.reference, ["title"]) && isText(context.reference.title, 180));
  return validContext && (value.results === undefined || Array.isArray(value.results) && value.results.length <= CHEF_AGENT_MAX_TOOLS && value.results.every((entry) => isObject(entry) && closed(entry, ["tool", "result"]) && tools.includes(entry.tool as ChefMcpToolNameV1) && result(entry.result)));
}

export function isChefAgentDecisionV1(value: unknown): value is ChefAgentDecisionV1 {
  if (!isObject(value) || typeof value.kind !== "string") return false;
  if (value.kind === "tool") return closed(value, ["kind", "tool", "input"]) && tools.includes(value.tool as ChefMcpToolNameV1) && isChefAgentToolInputForTool(value.tool as ChefMcpToolNameV1, value.input);
  return value.kind === "final" && closed(value, ["kind", "output", "text", "createVariant"])
    && ["ideas", "search", "preview", "advice", "clarify"].includes(value.output as string)
    && (value.text === undefined || isText(value.text, 600))
    && (value.createVariant === undefined || typeof value.createVariant === "boolean");
}

/** Contrat V2 fermé : le navigateur ne transmet qu'une projection temporaire. */
export const CHEF_RUNTIME_LIMITS_V1 = Object.freeze({ maxSteps: 6, maxActiveSkills: 4, maxProjectionChars: 2_400, maxResultChars: 1_200, maxTotalResultChars: 2_400, highWaterRatio: 0.8 });
export type ChefRuntimeLimitKeyV1 = keyof Omit<typeof CHEF_RUNTIME_LIMITS_V1, "highWaterRatio">;
export type ChefRuntimeLimitAuditEventV1 = Readonly<{ catalogRevision: string; step: number; key: ChefRuntimeLimitKeyV1; configured: number; observed: number; action: "observe" | "truncate" | "evict" | "omit" | "fallback"; outcome: "limit_high_water" | "limit_enforced" }>;
export type ChefAgentProjectionV2 = Readonly<{ message: string; recentExcerpt?: string; context?: ChefAgentContextV1 }>;
export type ChefAgentTurnWireV2 = Readonly<{ catalogRevision: string; nonce: string; step: number; activeSkills: string[]; projection: ChefAgentProjectionV2; results?: Array<{ tool: string; result: Record<string, unknown> }> }>;
export type ChefAgentDecisionV2 = Readonly<{ kind: "final"; output: ChefAgentFinalV1["output"]; text?: string }> | Readonly<{ kind: "tool"; tool: string; input: Record<string, unknown> }> | Readonly<{ kind: "activate_skill"; skill: string }>;

const v2Skill = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9-]{1,63}$/.test(value);
const safeNonce = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{16,96}$/.test(value);
const hasForbiddenData = (value: unknown): boolean => {
  if (typeof value === "string") return /(?:blob:|data:|\b(?:indexeddb|dexie|file|blob)\b|\b(?:recipe|candidate|conversation)[_-]?id\s*[:=]|\b(?:api|secret|token)[_-]?(?:key|token|secret)\b|\b(?:api|secret|token|sk)[_-]?[a-z0-9]{12,})/iu.test(value);
  if (!isObject(value)) return Array.isArray(value) && value.some(hasForbiddenData);
  return Object.entries(value).some(([key, child]) => /(?:^|[_-])(?:id|file|blob|binary|profile|cahier|prompt|reasoning)(?:$|[_-])/iu.test(key) || hasForbiddenData(child));
};
export function isChefAgentTurnWireV2(value: unknown): value is ChefAgentTurnWireV2 {
  if (!isObject(value) || !closed(value, ["catalogRevision", "nonce", "step", "activeSkills", "projection", "results"])) return false;
  if (!isText(value.catalogRevision, 120) || !safeNonce(value.nonce) || typeof value.step !== "number" || !Number.isInteger(value.step) || value.step < 0 || value.step >= CHEF_RUNTIME_LIMITS_V1.maxSteps) return false;
  if (!Array.isArray(value.activeSkills) || !value.activeSkills.length || value.activeSkills.length > CHEF_RUNTIME_LIMITS_V1.maxActiveSkills || new Set(value.activeSkills).size !== value.activeSkills.length || !value.activeSkills.every(v2Skill)) return false;
  if (!isObject(value.projection) || !closed(value.projection, ["message", "recentExcerpt", "context"]) || !isText(value.projection.message, CHEF_RUNTIME_LIMITS_V1.maxProjectionChars) || (value.projection.recentExcerpt !== undefined && !isText(value.projection.recentExcerpt, CHEF_RUNTIME_LIMITS_V1.maxProjectionChars)) || hasForbiddenData(value.projection)) return false;
  const contextWire = value.projection.context === undefined || isChefAgentRequestV1({ message: value.projection.message, skills: ["chef-core"], tools: ["search-notebook", "assistant-advice", "classify-turn"], context: value.projection.context });
  if (!contextWire) return false;
  return value.results === undefined || Array.isArray(value.results) && value.results.length <= CHEF_RUNTIME_LIMITS_V1.maxSteps && value.results.every((entry) => isObject(entry) && closed(entry, ["tool", "result"]) && v2Skill(entry.tool) && isObject(entry.result) && !hasForbiddenData(entry.result));
}
export function isChefAgentDecisionV2(value: unknown): value is ChefAgentDecisionV2 {
  if (!isObject(value) || typeof value.kind !== "string") return false;
  if (value.kind === "activate_skill") return closed(value, ["kind", "skill"]) && v2Skill(value.skill);
  if (value.kind === "tool") return closed(value, ["kind", "tool", "input"]) && v2Skill(value.tool) && isObject(value.input) && !hasForbiddenData(value.input);
  return value.kind === "final" && closed(value, ["kind", "output", "text"]) && ["ideas", "search", "preview", "advice", "clarify"].includes(value.output as string) && (value.text === undefined || isText(value.text, 600) && !hasForbiddenData(value.text));
}
export function chefRuntimeLimitAudit(catalogRevision: string, step: number, key: ChefRuntimeLimitKeyV1, observed: number, action: ChefRuntimeLimitAuditEventV1["action"]): ChefRuntimeLimitAuditEventV1 | null {
  const configured = CHEF_RUNTIME_LIMITS_V1[key];
  if (observed < Math.ceil(configured * CHEF_RUNTIME_LIMITS_V1.highWaterRatio)) return null;
  return { catalogRevision, step, key, configured, observed, action, outcome: observed > configured ? "limit_enforced" : "limit_high_water" };
}
