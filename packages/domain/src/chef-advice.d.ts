export const CHEF_ADVICE_REQUEST_MAX_LENGTH: number;
export type ChefAdviceConfidence = "certain" | "suppose" | "a_verifier";
export type ChefAdviceRequestV1 = { request: string; context?: { recipeTitle?: string; stepText?: string; servings?: number; ingredients?: string[] } };
export type ChefAdviceWireV1 = { kind: "recipe" } | { kind: "advice"; recommendation: string; reason: string; alternative?: string; confidence: ChefAdviceConfidence[] } | { kind: "clarify"; question: string } | { kind: "photo"; request: string };
export function isChefAdviceRequestV1(value: unknown): value is ChefAdviceRequestV1;
export function isChefAdviceWireV1(value: unknown): value is ChefAdviceWireV1;
