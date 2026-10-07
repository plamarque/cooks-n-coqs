export const CHEF_ADVICE_REQUEST_MAX_LENGTH = 2_600;
export const CHEF_ADVICE_THUMBNAIL_MAX_LENGTH = 140_000;
export const CHEF_ADVICE_CONTEXT_TOTAL_MAX_LENGTH = 400_000;
const text = (value, max) => typeof value === "string" && !!value.trim() && value.trim().length <= max;
const isCard = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const card = value;
  return Object.keys(card).every((key) => ["title", "ingredients", "steps", "thumbnail"].includes(key)) && text(card.title, 180) && Array.isArray(card.ingredients) && card.ingredients.length <= 40 && card.ingredients.every((item) => text(item, 180)) && Array.isArray(card.steps) && card.steps.length <= 30 && card.steps.every((item) => text(item, 2_000)) && (card.thumbnail === undefined || typeof card.thumbnail === "string" && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(card.thumbnail) && card.thumbnail.length <= CHEF_ADVICE_THUMBNAIL_MAX_LENGTH);
};
const isTurn = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const turn = value;
  return Object.keys(turn).every((key) => ["role", "text", "cards"].includes(key)) && (turn.role === "user" || turn.role === "assistant") && text(turn.text, CHEF_ADVICE_CONTEXT_TOTAL_MAX_LENGTH) && (turn.cards === undefined || Array.isArray(turn.cards) && turn.cards.every(isCard));
};
const contextLength = (turns) => new TextEncoder().encode(JSON.stringify(turns)).byteLength;
export function isChefAdviceRequestV1(value) {
  if (!value || typeof value !== "object") return false;
  const candidate = value;
  if (Object.keys(candidate).some((key) => key !== "request" && key !== "context") || !text(candidate.request, CHEF_ADVICE_REQUEST_MAX_LENGTH)) return false;
  if (candidate.context === undefined) return true;
  if (!candidate.context || typeof candidate.context !== "object" || Array.isArray(candidate.context)) return false;
  const context = candidate.context;
  return Object.keys(context).every((key) => ["recipeTitle", "stepText", "servings", "ingredients", "turns"].includes(key)) && (context.recipeTitle === undefined || text(context.recipeTitle, 180)) && (context.stepText === undefined || text(context.stepText, 2_000)) && (context.servings === undefined || typeof context.servings === "number" && Number.isInteger(context.servings) && context.servings > 0 && context.servings <= 100) && (context.ingredients === undefined || Array.isArray(context.ingredients) && context.ingredients.length <= 40 && context.ingredients.every((item) => text(item, 180))) && (context.turns === undefined || Array.isArray(context.turns) && context.turns.every(isTurn) && contextLength(context.turns) <= CHEF_ADVICE_CONTEXT_TOTAL_MAX_LENGTH);
}
export function isChefAdviceWireV1(value) {
  if (!value || typeof value !== "object") return false;
  const wire = value;
  if (wire.kind === "recipe") return Object.keys(wire).length === 1;
  if (wire.kind === "clarify") return Object.keys(wire).length === 2 && text(wire.question, 240);
  if (wire.kind === "photo") return Object.keys(wire).length === 2 && text(wire.request, 240);
  return wire.kind === "advice" && Object.keys(wire).every((key) => ["kind", "recommendation", "reason", "alternative", "confidence"].includes(key)) && text(wire.recommendation, 500) && text(wire.reason, 240) && (wire.alternative === undefined || text(wire.alternative, 320)) && Array.isArray(wire.confidence) && wire.confidence.length >= 1 && wire.confidence.length <= 3 && new Set(wire.confidence).size === wire.confidence.length && wire.confidence.every((item) => item === "certain" || item === "suppose" || item === "a_verifier");
}
