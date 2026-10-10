export const CHEF_TURN_CLASSIFICATION_MESSAGE_MAX_LENGTH = 2600;
export const CHEF_TURN_CLASSIFICATION_CONSTRAINT_MAX_LENGTH = 180;
const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const keys = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));
const uniqueText = (values) => new Set(values.map((value) => typeof value === "string" ? value.trim().toLocaleLowerCase("fr-FR") : value)).size === values.length;
export function isChefTurnClassificationRequestV1(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value;
  if (!keys(request, ["message", "context"]) || !text(request.message, CHEF_TURN_CLASSIFICATION_MESSAGE_MAX_LENGTH)) return false;
  if (request.context === undefined) return true;
  if (!request.context || typeof request.context !== "object" || Array.isArray(request.context)) return false;
  const context = request.context;
  return keys(context, ["objective", "constraints", "clarification", "reference"]) && (context.objective === undefined || text(context.objective, 500)) && (context.clarification === undefined || text(context.clarification, 240)) && (context.constraints === undefined || Array.isArray(context.constraints) && context.constraints.length <= 12 && uniqueText(context.constraints) && context.constraints.every((item) => text(item, CHEF_TURN_CLASSIFICATION_CONSTRAINT_MAX_LENGTH))) && (context.reference === undefined || !!context.reference && typeof context.reference === "object" && !Array.isArray(context.reference) && keys(context.reference, ["title"]) && text(context.reference.title, 180));
}
export function isChefTurnClassificationWireV1(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const wire = value;
  if (!keys(wire, ["intent", "confidence", "constraints", "missing"]) || !["idea", "search", "create", "adapt", "variant"].includes(wire.intent) || !["high", "medium", "low"].includes(wire.confidence)) return false;
  if (!Array.isArray(wire.constraints) || wire.constraints.length > 12 || !uniqueText(wire.constraints) || !wire.constraints.every((item) => text(item, CHEF_TURN_CLASSIFICATION_CONSTRAINT_MAX_LENGTH))) return false;
  if (wire.missing === undefined) return true;
  if (!wire.missing || typeof wire.missing !== "object" || Array.isArray(wire.missing) || !keys(wire.missing, ["field", "question"])) return false;
  return text(wire.missing.field, 80) && text(wire.missing.question, 240);
}
export function isChefTurnClassificationV1(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const classification = value;
  const { reference, ...wire } = classification;
  if (!keys(classification, ["intent", "confidence", "constraints", "missing", "reference"]) || !isChefTurnClassificationWireV1(wire)) return false;
  if (reference === undefined) return true;
  return !!reference && typeof reference === "object" && !Array.isArray(reference) && keys(reference, ["title", "source"]) && text(reference.title, 180) && ["clarification", "mentioned_recipe", "latest_card"].includes(reference.source);
}
