export const CHEF_ADVICE_REQUEST_MAX_LENGTH = 2_600;
const text = (value, max) => typeof value === "string" && !!value.trim() && value.trim().length <= max;
export function isChefAdviceRequestV1(value) {
  if (!value || typeof value !== "object") return false;
  const candidate = value;
  if (Object.keys(candidate).some((key) => key !== "request" && key !== "context") || !text(candidate.request, CHEF_ADVICE_REQUEST_MAX_LENGTH)) return false;
  if (candidate.context === undefined) return true;
  if (!candidate.context || typeof candidate.context !== "object" || Array.isArray(candidate.context)) return false;
  const context = candidate.context;
  return Object.keys(context).every((key) => ["recipeTitle", "stepText", "servings", "ingredients"].includes(key)) && (context.recipeTitle === undefined || text(context.recipeTitle, 180)) && (context.stepText === undefined || text(context.stepText, 2_000)) && (context.servings === undefined || typeof context.servings === "number" && Number.isInteger(context.servings) && context.servings > 0 && context.servings <= 100) && (context.ingredients === undefined || Array.isArray(context.ingredients) && context.ingredients.length <= 40 && context.ingredients.every((item) => text(item, 180)));
}
export function isChefAdviceWireV1(value) {
  if (!value || typeof value !== "object") return false;
  const wire = value;
  if (wire.kind === "recipe") return Object.keys(wire).length === 1;
  if (wire.kind === "clarify") return Object.keys(wire).length === 2 && text(wire.question, 240);
  if (wire.kind === "photo") return Object.keys(wire).length === 2 && text(wire.request, 240);
  return wire.kind === "advice" && Object.keys(wire).every((key) => ["kind", "recommendation", "reason", "alternative", "confidence"].includes(key)) && text(wire.recommendation, 500) && text(wire.reason, 240) && (wire.alternative === undefined || text(wire.alternative, 320)) && Array.isArray(wire.confidence) && wire.confidence.length >= 1 && wire.confidence.length <= 3 && new Set(wire.confidence).size === wire.confidence.length && wire.confidence.every((item) => item === "certain" || item === "suppose" || item === "a_verifier");
}
