export const CHEF_TURN_CLASSIFICATION_MESSAGE_MAX_LENGTH = 2_600;
export const CHEF_TURN_CLASSIFICATION_CONSTRAINT_MAX_LENGTH = 180;

/** Les sorties sont volontairement des intentions de routage, pas des actions. */
export type ChefTurnIntentV1 = "idea" | "search" | "create" | "adapt" | "variant";
export type ChefTurnConfidenceV1 = "high" | "medium" | "low";
export type ChefTurnReferenceV1 = { title: string; source: "clarification" | "mentioned_recipe" | "latest_card" };
export type ChefTurnMissingV1 = { field: string; question: string };
export type ChefTurnClassificationContextV1 = {
  objective?: string;
  constraints?: string[];
  clarification?: string;
  reference?: { title: string };
};
export type ChefTurnClassificationRequestV1 = { message: string; context?: ChefTurnClassificationContextV1 };
/** Le BFF ne reçoit ni ne renvoie une référence locale : elle est résolue par le client. */
export type ChefTurnClassificationWireV1 = {
  intent: ChefTurnIntentV1;
  confidence: ChefTurnConfidenceV1;
  constraints: string[];
  missing?: ChefTurnMissingV1;
};
export type ChefTurnClassificationV1 = ChefTurnClassificationWireV1 & { reference?: ChefTurnReferenceV1 };

const text = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const keys = (value: object, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key));
const uniqueText = (values: readonly unknown[]): boolean => new Set(values.map((value) => typeof value === "string" ? value.trim().toLocaleLowerCase("fr-FR") : value)).size === values.length;

export function isChefTurnClassificationRequestV1(value: unknown): value is ChefTurnClassificationRequestV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  if (!keys(request, ["message", "context"]) || !text(request.message, CHEF_TURN_CLASSIFICATION_MESSAGE_MAX_LENGTH)) return false;
  if (request.context === undefined) return true;
  if (!request.context || typeof request.context !== "object" || Array.isArray(request.context)) return false;
  const context = request.context as Record<string, unknown>;
  return keys(context, ["objective", "constraints", "clarification", "reference"])
    && (context.objective === undefined || text(context.objective, 500))
    && (context.clarification === undefined || text(context.clarification, 240))
    && (context.constraints === undefined || Array.isArray(context.constraints) && context.constraints.length <= 12 && uniqueText(context.constraints) && context.constraints.every((item) => text(item, CHEF_TURN_CLASSIFICATION_CONSTRAINT_MAX_LENGTH)))
    && (context.reference === undefined || !!context.reference && typeof context.reference === "object" && !Array.isArray(context.reference) && keys(context.reference as object, ["title"]) && text((context.reference as { title?: unknown }).title, 180));
}

export function isChefTurnClassificationWireV1(value: unknown): value is ChefTurnClassificationWireV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const wire = value as Record<string, unknown>;
  if (!keys(wire, ["intent", "confidence", "constraints", "missing"]) || !["idea", "search", "create", "adapt", "variant"].includes(wire.intent as string) || !["high", "medium", "low"].includes(wire.confidence as string)) return false;
  if (!Array.isArray(wire.constraints) || wire.constraints.length > 12 || !uniqueText(wire.constraints) || !wire.constraints.every((item) => text(item, CHEF_TURN_CLASSIFICATION_CONSTRAINT_MAX_LENGTH))) return false;
  if (wire.missing === undefined) return true;
  if (!wire.missing || typeof wire.missing !== "object" || Array.isArray(wire.missing) || !keys(wire.missing as object, ["field", "question"])) return false;
  const missing = wire.missing as Record<string, unknown>;
  return text(missing.field, 80) && text(missing.question, 240);
}

export function isChefTurnClassificationV1(value: unknown): value is ChefTurnClassificationV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const classification = value as Record<string, unknown>;
  const { reference, ...wire } = classification;
  if (!keys(classification, ["intent", "confidence", "constraints", "missing", "reference"]) || !isChefTurnClassificationWireV1(wire)) return false;
  if (reference === undefined) return true;
  if (!reference || typeof reference !== "object" || Array.isArray(reference) || !keys(reference as object, ["title", "source"])) return false;
  const localReference = reference as Record<string, unknown>;
  return text(localReference.title, 180) && ["clarification", "mentioned_recipe", "latest_card"].includes(localReference.source as string);
}
