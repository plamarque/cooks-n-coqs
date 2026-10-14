export const CHEF_AGENT_MAX_STEPS = 6;
/** Les tools suivent la progression, sans plafond distinct arbitraire. */
export const CHEF_AGENT_MAX_TOOLS = CHEF_AGENT_MAX_STEPS;
export const CHEF_AGENT_MESSAGE_MAX_LENGTH = 2_600;
const skills = ["chef-core", "adapter-une-recette"];
const tools = ["search-notebook", "get-recipe-context", "prepare-preview", "assistant-advice", "assistant-recipe", "classify-turn"];
const isText = (value, max) => typeof value === "string" && !!value.trim() && value.trim().length <= max;
const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const closed = (value, names) => Object.keys(value).every((key) => names.includes(key));
const safeStrings = (value, maximum, itemMaximum) => Array.isArray(value) && value.length <= maximum && value.every((item) => isText(item, itemMaximum));
const uniqueText = (values) => new Set(values.map((value) => value.trim().toLocaleLowerCase("fr-FR"))).size === values.length;
const input = (value) => isObject(value) && ((closed(value, ["query"]) && isText(value.query, 2_600)) || (closed(value, ["referenceTitle"]) && (value.referenceTitle === undefined || isText(value.referenceTitle, 180))) || (closed(value, ["request"]) && isText(value.request, 2_600)) || (closed(value, ["message", "context"]) && isText(value.message, 2_600) && (value.context === undefined || isText(value.context, 2_000))));
export function isChefAgentToolInputForTool(tool, value) { if (!input(value)) return false; if (tool === "search-notebook") return "query" in value; if (tool === "get-recipe-context") return Object.keys(value).every((key) => key === "referenceTitle"); if (tool === "prepare-preview" || tool === "assistant-advice" || tool === "assistant-recipe") return "request" in value; return "message" in value; }
const result = (value) => isObject(value) && ((closed(value, ["titles"]) && safeStrings(value.titles, 3, 180)) || (closed(value, ["recipe"]) && isObject(value.recipe) && closed(value.recipe, ["title", "ingredients", "steps"]) && isText(value.recipe.title, 180) && safeStrings(value.recipe.ingredients, 16, 180) && safeStrings(value.recipe.steps, 8, 500)) || (closed(value, ["prepared"]) && value.prepared === true) || (closed(value, ["text"]) && isText(value.text, 600)) || (closed(value, ["intent", "constraints"]) && isText(value.intent, 20) && safeStrings(value.constraints, 12, 180)));
export function isChefAgentRequestV1(value) {
  if (!isObject(value) || !closed(value, ["message", "skills", "tools", "context", "results"]) || !isText(value.message, CHEF_AGENT_MESSAGE_MAX_LENGTH)) return false;
  if (!Array.isArray(value.skills) || !value.skills.length || new Set(value.skills).size !== value.skills.length || !value.skills.every((skill) => skills.includes(skill))) return false;
  const expectedTools = new Set(value.skills.flatMap((skill) => skill === "chef-core" ? ["search-notebook", "assistant-advice", "classify-turn"] : ["get-recipe-context", "prepare-preview", "assistant-advice"]));
  if (!Array.isArray(value.tools) || value.tools.length !== expectedTools.size || new Set(value.tools).size !== value.tools.length || !value.tools.every((tool) => expectedTools.has(tool))) return false;
  const context = value.context;
  const validContext = context === undefined || isObject(context) && Object.keys(context).length > 0 && closed(context, ["objective", "constraints", "clarification", "reference"])
    && (context.objective === undefined || isText(context.objective, 500))
    && (context.clarification === undefined || isText(context.clarification, 240))
    && (context.constraints === undefined || safeStrings(context.constraints, 12, 180) && uniqueText(context.constraints))
    && (context.reference === undefined || isObject(context.reference) && closed(context.reference, ["title"]) && isText(context.reference.title, 180));
  return validContext && (value.results === undefined || Array.isArray(value.results) && value.results.length <= CHEF_AGENT_MAX_TOOLS && value.results.every((entry) => isObject(entry) && closed(entry, ["tool", "result"]) && tools.includes(entry.tool) && result(entry.result)));
}
export function isChefAgentDecisionV1(value) {
  if (!isObject(value) || typeof value.kind !== "string") return false;
  if (value.kind === "tool") return closed(value, ["kind", "tool", "input"]) && tools.includes(value.tool) && isChefAgentToolInputForTool(value.tool, value.input);
  return value.kind === "final" && closed(value, ["kind", "output", "text", "createVariant"]) && ["ideas", "search", "preview", "advice", "clarify"].includes(value.output) && (value.text === undefined || isText(value.text, 600)) && (value.createVariant === undefined || typeof value.createVariant === "boolean");
}
export const CHEF_RUNTIME_LIMITS_V1 = Object.freeze({ maxSteps: 6, maxActiveSkills: 4, maxProjectionChars: 2400, maxResultChars: 1200, maxTotalResultChars: 2400, highWaterRatio: .8 });
const v2Skill = (value) => typeof value === "string" && /^[a-z][a-z0-9-]{1,63}$/.test(value);
const safeNonce = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{16,96}$/.test(value);
const hasForbiddenData = (value) => {
  if (typeof value === "string") return /(?:blob:|data:|\b(?:indexeddb|dexie|file|blob)\b|\b(?:recipe|candidate|conversation)[_-]?id\s*[:=]|\b(?:api|secret|token)[_-]?(?:key|token|secret)\b|\b(?:api|secret|token|sk)[_-]?[a-z0-9]{12,})/iu.test(value);
  if (!isObject(value)) return Array.isArray(value) && value.some(hasForbiddenData);
  return Object.entries(value).some(([key, child]) => /(?:^|[_-])(?:id|file|blob|binary|profile|cahier|prompt|reasoning)(?:$|[_-])/iu.test(key) || hasForbiddenData(child));
};
export function isChefAgentTurnWireV2(value) {
  if (!isObject(value) || !closed(value, ["catalogRevision", "nonce", "step", "activeSkills", "projection", "results"])) return false;
  if (!isText(value.catalogRevision, 120) || !safeNonce(value.nonce) || typeof value.step !== "number" || !Number.isInteger(value.step) || value.step < 0 || value.step >= CHEF_RUNTIME_LIMITS_V1.maxSteps) return false;
  if (!Array.isArray(value.activeSkills) || !value.activeSkills.length || value.activeSkills.length > CHEF_RUNTIME_LIMITS_V1.maxActiveSkills || new Set(value.activeSkills).size !== value.activeSkills.length || !value.activeSkills.every(v2Skill)) return false;
  if (!isObject(value.projection) || !closed(value.projection, ["message", "recentExcerpt", "context"]) || !isText(value.projection.message, CHEF_RUNTIME_LIMITS_V1.maxProjectionChars) || value.projection.recentExcerpt !== void 0 && !isText(value.projection.recentExcerpt, CHEF_RUNTIME_LIMITS_V1.maxProjectionChars) || hasForbiddenData(value.projection)) return false;
  const contextWire = value.projection.context === undefined || isChefAgentRequestV1({ message: value.projection.message, skills: ["chef-core"], tools: ["search-notebook", "assistant-advice", "classify-turn"], context: value.projection.context });
  if (!contextWire) return false;
  return value.results === undefined || Array.isArray(value.results) && value.results.length <= CHEF_RUNTIME_LIMITS_V1.maxSteps && value.results.every((entry) => isObject(entry) && closed(entry, ["tool", "result"]) && v2Skill(entry.tool) && isObject(entry.result) && !hasForbiddenData(entry.result));
}
export function isChefAgentDecisionV2(value) {
  if (!isObject(value) || typeof value.kind !== "string") return false;
  if (value.kind === "activate_skill") return closed(value, ["kind", "skill"]) && v2Skill(value.skill);
  if (value.kind === "tool") return closed(value, ["kind", "tool", "input"]) && v2Skill(value.tool) && isObject(value.input) && !hasForbiddenData(value.input);
  return value.kind === "final" && closed(value, ["kind", "output", "text"]) && ["ideas", "search", "preview", "advice", "clarify"].includes(value.output) && (value.text === undefined || isText(value.text, 600) && !hasForbiddenData(value.text));
}
export function chefRuntimeLimitAudit(catalogRevision, step, key, observed, action) {
  const configured = CHEF_RUNTIME_LIMITS_V1[key];
  if (observed < Math.ceil(configured * CHEF_RUNTIME_LIMITS_V1.highWaterRatio)) return null;
  return { catalogRevision, step, key, configured, observed, action, outcome: observed > configured ? "limit_enforced" : "limit_high_water" };
}
