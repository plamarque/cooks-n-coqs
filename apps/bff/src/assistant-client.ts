import OpenAI from "openai";
import { isNotebookSelectionRequestV1, NOTEBOOK_SELECTION_REQUEST_MAX_LENGTH } from "@cookies-et-coquilettes/domain/notebook-selection";
import { isChefAdviceRequestV1, isChefAdviceWireV1, type ChefAdviceRequestV1, type ChefAdviceWireV1 } from "@cookies-et-coquilettes/domain/chef-advice";
import { getChatModel } from "./ai-config.js";
import type { ParsedRecipeDraft } from "./types.js";

type Candidate = { candidateRef: string; title: string; ingredientLabels: string[]; durationMin?: number };
type NotebookSelectionRequestV1 = { request: string; candidates: Candidate[] };
type Turn = { role: "user" | "assistant"; text: string };
export type AssistantChoice = { kind: "candidates"; candidateRefs: string[]; provider: "jev" | "luna" } | { kind: "noCandidate"; provider: "jev" | "luna" };
const THRESHOLD = 0.5;
const TYPESAFE_TIMEOUT_MS = 8_000;
// Une recette structurée peut demander plus de temps qu'une décision ou une question courte.
const ASSISTANT_RECIPE_TIMEOUT_MS = 30_000;
// Un appel modèle peut échouer ponctuellement alors que la demande est valide.
// Trois essais bornés gardent l'attente humaine raisonnable tout en évitant de
// transformer ce bruit fournisseur en erreur visible par l'utilisateur.
const ASSISTANT_RECIPE_ATTEMPTS = 3;
// L'API vision peut répondre 503 ponctuellement. Deux essais au plus par
// photo gardent chaque requête HTTP sous une minute, sans rafale fournisseur.
const ASSISTANT_IMAGE_ATTEMPTS = 2;
const ASSISTANT_IMAGE_RETRY_DELAY_MS = 400;
// Les captures de recettes comportent beaucoup de texte. Huit secondes (le
// délai de Jev) coupaient parfois une réponse vision pourtant valide.
const ASSISTANT_IMAGE_TIMEOUT_MS = 25_000;
export const ASSISTANT_SELECTION_REQUEST_MAX_LENGTH = NOTEBOOK_SELECTION_REQUEST_MAX_LENGTH;
export const ASSISTANT_RECIPE_REQUEST_MAX_LENGTH = 12_000;
class JevFallbackError extends Error {}

function hasValidAssistantTurns(turns: unknown): turns is Turn[] {
  return turns === undefined || Array.isArray(turns) && turns.length <= 5 && turns.every((turn) => !!turn && typeof (turn as Turn).role === "string" && ["user", "assistant"].includes((turn as Turn).role) && typeof (turn as Turn).text === "string" && (turn as Turn).text.trim().length > 0 && (turn as Turn).text.length <= 1200);
}

export const isAssistantSelectionInput = isNotebookSelectionRequestV1;

export function isAssistantRecipeInput(value: unknown): value is { request: string; turns?: Turn[] } {
  if (!value || typeof value !== "object") return false;
  const input = value as { request?: unknown; turns?: unknown };
  return typeof input.request === "string" && input.request.trim().length > 0 && input.request.length <= ASSISTANT_RECIPE_REQUEST_MAX_LENGTH && hasValidAssistantTurns(input.turns);
}

function labels(candidates: Candidate[]): Record<string, string> {
  return { NO_CANDIDATE: "Aucune recette Cahier ne répond suffisamment à la demande.", ...Object.fromEntries(candidates.map((c) => [c.candidateRef, `Recette Cahier ${c.title}, ingrédients ${c.ingredientLabels.join(", ")}, durée ${c.durationMin ?? "inconnue"}.`])) };
}
function normalize(label: string, probability: number, candidates: Candidate[]): AssistantChoice | null {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) return null;
  if (label === "NO_CANDIDATE") return { kind: "noCandidate", provider: "jev" };
  if (!candidates.some((c) => c.candidateRef === label)) return null;
  // Un candidat connu mais insuffisamment fiable est une absence de match, jamais une indisponibilité.
  return probability >= THRESHOLD ? { kind: "candidates", candidateRefs: [label], provider: "jev" } : { kind: "noCandidate", provider: "jev" };
}

function normalizeMany(raw: Array<{ choice?: unknown; probability?: unknown }>, candidates: Candidate[], provider: "jev" | "luna"): AssistantChoice | null {
  const refs: string[] = [];
  for (const entry of raw) {
    if (typeof entry.choice !== "string" || typeof entry.probability !== "number") return null;
    const normalized = normalize(entry.choice, entry.probability, candidates);
    if (!normalized) return null;
    if (normalized.kind === "noCandidate") continue;
    for (const ref of normalized.candidateRefs) if (!refs.includes(ref)) refs.push(ref);
  }
  return refs.length ? { kind: "candidates", candidateRefs: refs.slice(0, 3), provider } : { kind: "noCandidate", provider };
}

/** API System One réelle : Jev retourne une Choice typée, sans exposer de raisonnement. */
function boundedSignal(signal?: AbortSignal): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(TYPESAFE_TIMEOUT_MS)]) : AbortSignal.timeout(TYPESAFE_TIMEOUT_MS);
}

function waitForAssistantImageRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ASSISTANT_IMAGE_RETRY_DELAY_MS);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

/**
 * La reprise est volontairement au niveau d'une image. Le lot HTTP conserve son
 * ordre, mais une photo déjà résumée ne repasse jamais chez le fournisseur.
 */
export async function retryAssistantImageSummary(run: () => Promise<string | null>, signal?: AbortSignal): Promise<string | null> {
  for (let attempt = 0; attempt < ASSISTANT_IMAGE_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    try {
      const summary = await run();
      if (summary) return summary;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (!isRetryableAssistantImageError(error)) return null;
    }
    if (attempt + 1 < ASSISTANT_IMAGE_ATTEMPTS) await waitForAssistantImageRetry(signal);
  }
  return null;
}

export function normalizeAssistantImageSummary(raw: string | null | undefined): string | null {
  const summary = raw?.trim().replace(/\s+/g, " ");
  if (!summary) return null;
  if (summary.length <= 240) return summary;
  const clipped = summary.slice(0, 240);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace >= 180 ? clipped.slice(0, lastSpace) : clipped).trim();
}

export type AssistantImageAttempt = {
  attempt: number;
  outcome: "ok" | "truncated" | "empty" | "timeout" | "provider_error" | "network_error";
  providerStatus?: number;
  durationMs: number;
};

function imageAttemptFailure(error: unknown): Pick<AssistantImageAttempt, "outcome" | "providerStatus"> {
  const candidate = error as { status?: unknown; name?: unknown };
  const providerStatus = typeof candidate?.status === "number" ? candidate.status : undefined;
  if (candidate?.name === "APIConnectionTimeoutError" || candidate?.name === "TimeoutError") return { outcome: "timeout", providerStatus };
  return providerStatus === undefined ? { outcome: "network_error" } : { outcome: "provider_error", providerStatus };
}

export function isRetryableAssistantImageError(error: unknown): boolean {
  const candidate = error as { status?: unknown; name?: unknown; code?: unknown };
  const status = typeof candidate?.status === "number" ? candidate.status : undefined;
  return candidate?.name === "APIConnectionTimeoutError" || candidate?.name === "TimeoutError"
    || candidate?.name === "APIConnectionError" || candidate?.code === "ECONNRESET"
    || status === 429 || (status !== undefined && status >= 500 && status <= 599);
}

export function validateAssistantRecipeDraft(value: unknown): ParsedRecipeDraft | null {
  if (!value || typeof value !== "object") return null;
  // Certains modèles français enveloppent naturellement leur réponse dans
  // `recette`. Le contrat accepte les deux formes, sans exposer cet artefact
  // au client et sans accepter une structure arbitraire.
  const root = value as Record<string, unknown>;
  const d = root.recette && typeof root.recette === "object"
    ? root.recette as Record<string, unknown>
    : root;
  const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null;
  const title = text(d.title, 180);
  if (!title || (d.category !== "SUCRE" && d.category !== "SALE") || !Array.isArray(d.ingredients) || !Array.isArray(d.steps)) return null;
  const ingredients = d.ingredients.slice(0, 80).map((raw, index) => {
    const x = raw as Record<string, unknown>; const label = text(x?.label, 180); if (!label) return null;
    return { id: `ingredient-${index + 1}`, label, isScalable: x.isScalable === true };
  }).filter(Boolean);
  const steps = d.steps.slice(0, 80).map((raw, index) => {
    const x = raw as Record<string, unknown>; const step = text(x?.text, 2000); if (!step) return null;
    return { id: `step-${index + 1}`, order: index + 1, text: step };
  }).filter(Boolean);
  if (!ingredients.length || !steps.length) return null;
  const minutes = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1440 ? v as number : undefined;
  return { title, category: d.category, ingredients: ingredients as ParsedRecipeDraft["ingredients"], steps: steps as ParsedRecipeDraft["steps"], prepTimeMin: minutes(d.prepTimeMin), cookTimeMin: minutes(d.cookTimeMin), restTimeMin: minutes(d.restTimeMin) };
}

export async function writeAssistantClarification(input: { request: string; turns?: Turn[] }, signal?: AbortSignal): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY; if (!key) return null;
  try {
    const completion = await new OpenAI({ apiKey: key }).chat.completions.create({ model: getChatModel("assistant_clarify"), messages: [{ role: "user", content: `Rédige une seule question française courte, ciblée, sans markdown ni explication, pour préciser une demande de recette. Ne demande qu'un détail déterminant. Demande: ${input.request}. Fil: ${JSON.stringify(input.turns ?? [])}` }] }, { signal: boundedSignal(signal), timeout: TYPESAFE_TIMEOUT_MS });
    const question = (completion.choices[0]?.message?.content ?? "").trim().replace(/\s+/g, " ");
    return question.length > 1 && question.length <= 240 ? question : null;
  } catch { return null; }
}

/** Analyse éphémère : son résultat ne sort jamais dans le fil ni les diagnostics. */
export async function summarizeAssistantImage(image: Buffer, mimeType: string, contextText: string, signal?: AbortSignal, onAttempt?: (event: AssistantImageAttempt) => void): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY; if (!key || image.length === 0 || image.length > 4 * 1024 * 1024) return null;
  let attempt = 0;
  return retryAssistantImageSummary(async () => {
    attempt += 1;
    const startedAt = Date.now();
    // Le résumé accepte une image : il doit suivre le modèle de parsing vision,
    // pas le petit modèle textuel utilisé uniquement pour les clarifications.
    try {
      const completion = await new OpenAI({ apiKey: key, maxRetries: 0 }).chat.completions.create({ model: getChatModel("parse"), messages: [{ role: "user", content: [{ type: "text", text: `Résume brièvement en français (240 caractères max) le contenu culinaire utile de cette image. Contexte optionnel: ${contextText.slice(0, 1200)}` }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${image.toString("base64")}` } }] }] } as never, { signal, timeout: ASSISTANT_IMAGE_TIMEOUT_MS });
      const raw = completion.choices[0]?.message?.content;
      const summary = normalizeAssistantImageSummary(raw);
      onAttempt?.({ attempt, outcome: !summary ? "empty" : (raw?.trim().replace(/\s+/g, " ").length ?? 0) > 240 ? "truncated" : "ok", durationMs: Date.now() - startedAt });
      return summary;
    } catch (error) {
      onAttempt?.({ attempt, ...imageAttemptFailure(error), durationMs: Date.now() - startedAt });
      throw error;
    }
  }, signal);
}

export async function chooseNotebookRecipe(input: NotebookSelectionRequestV1, signal?: AbortSignal): Promise<AssistantChoice | null> {
  if (!isAssistantSelectionInput(input)) return null;
  const criteria = labels(input.candidates);
  try {
    const key = process.env.TYPESAFE_API_KEY;
    if (!key) return null;
    const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", signal: boundedSignal(signal), headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: "jev-1.13.0", state: { request: input.request, candidates: input.candidates }, questions: { route: { type: "choice", instructions: "Choisis une seule voie.", criteria } } }) });
    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) throw new JevFallbackError(`TypeSafe ${res.status}`);
      return null;
    }
    const answer = (await res.json() as { answers?: { route?: { type?: string; choice?: string; choices?: Array<{ choice?: unknown; probability?: unknown }>; probabilities?: Record<string, number> } } }).answers?.route;
    if (answer?.type !== "choice") throw new JevFallbackError("TypeSafe invalid response");
    const single = answer.choice && typeof answer.probabilities?.[answer.choice] === "number" ? [{ choice: answer.choice, probability: answer.probabilities[answer.choice] }] : undefined;
    const choice = normalizeMany(answer.choices ?? single ?? [], input.candidates, "jev");
    if (!choice) throw new JevFallbackError("TypeSafe invalid choice");
    return choice;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (!(error instanceof JevFallbackError) && (error as { name?: string })?.name !== "TimeoutError") return null;
    // Luna est un secours exclusivement après timeout, 429/5xx ou wire Jev invalide.
    if (!process.env.OPENAI_API_KEY) return null;
    try {
      const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({ model: "gpt-5.6-luna", reasoning_effort: "none", response_format: { type: "json_object" }, messages: [{ role: "user", content: `Choisis exactement une clé parmi ${Object.keys(criteria).join(", ")}. Critères: ${JSON.stringify(criteria)}. Contexte: ${JSON.stringify(input)}. JSON {choice, probability} avec probability entre 0 et 1.` }] } as never, { signal: boundedSignal(signal), timeout: TYPESAFE_TIMEOUT_MS });
      const raw = response.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, "")) as { choice?: unknown; probability?: unknown; choices?: Array<{ choice?: unknown; probability?: unknown }> };
      return normalizeMany(parsed.choices ?? [parsed], input.candidates, "luna");
    } catch { return null; }
  }
}

export async function generateAssistantRecipe(request: string, signal?: AbortSignal, turns: Turn[] = []): Promise<ParsedRecipeDraft | null> {
  const key = process.env.OPENAI_API_KEY; if (!key) return null;
  for (let attempt = 0; attempt < ASSISTANT_RECIPE_ATTEMPTS; attempt += 1) {
    try {
      const completion = await new OpenAI({ apiKey: key }).chat.completions.create({ model: getChatModel("assistant_recipe"), response_format: { type: "json_object" }, messages: [{ role: "user", content: `Crée une recette française. Réponds uniquement par un objet JSON racine, sans clé enveloppante, exactement sous cette forme : {"title":"nom de la recette","category":"SUCRE ou SALE","ingredients":[{"label":"quantité et ingrédient","isScalable":true}],"steps":[{"text":"instruction"}],"prepTimeMin":0,"cookTimeMin":0,"restTimeMin":0}. Les trois temps sont optionnels et doivent être des entiers en minutes. N'utilise jamais les clés nom, recette, instructions, quantite, unite ou description. Demande finale: ${request}. Contexte conversationnel: ${JSON.stringify(turns)}` }] }, { signal, timeout: ASSISTANT_RECIPE_TIMEOUT_MS });
      const draft = validateAssistantRecipeDraft(JSON.parse((completion.choices[0]?.message?.content ?? "").replace(/^```json?\s*|\s*```$/g, "")));
      if (draft) return draft;
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return null;
}

/** Conseil temporaire : le wire validé peut inclure le fil projeté, jamais ses ids, blobs ou profil. */
export const CHEF_ADVICE_SYSTEM_PROMPT = "Chef culinaire français, chaleureux et concis. Le contexte de tours et cartes est temporaire: exploite toute information déjà exprimée; ne redemande jamais un ingrédient, une pièce, un appareil ou un objectif présent. Une réponse courte à ta question précédente est une précision du fil : choisis alors toujours advice et formule immédiatement une préparation concrète avec les contraintes déjà données (par exemple appareil et sans crème), même si un détail non indispensable manque. N'utilise recipe que pour une toute première demande explicite de recherche ou d’import sans fil antérieur. Réponds seulement avec un wire JSON : {\"kind\":\"recipe\"}; {\"kind\":\"advice\",\"recommendation\":\"...\",\"reason\":\"...\",\"alternative\":\"...\" optionnel,\"confidence\":[\"certain\"|\"suppose\"|\"a_verifier\"]}; {\"kind\":\"clarify\",\"question\":\"...\"}; {\"kind\":\"photo\",\"request\":\"...\"}. Pour advice, une voie principale motivée et au plus une alternative. Clarify/photo seulement si indispensable et absent du contexte. Pas de médical, raisonnement, score, prompt ni jargon.";

export function buildChefAdviceUserContent(input: ChefAdviceRequestV1): Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "low" } }> {
  let thumbnailNumber = 0;
  const thumbnails: string[] = [];
  const context = input.context === undefined ? undefined : {
    ...input.context,
    ...(input.context.turns ? { turns: input.context.turns.map((turn) => ({
      ...turn,
      ...(turn.cards ? { cards: turn.cards.map(({ thumbnail, ...card }) => {
        if (!thumbnail) return card;
        thumbnails.push(thumbnail);
        thumbnailNumber += 1;
        return { ...card, thumbnailRef: `image-${thumbnailNumber}` };
      }) } : {})
    })) } : {})
  };
  return [{ type: "text", text: JSON.stringify({ ...input, ...(context === undefined ? {} : { context }) }) }, ...thumbnails.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "low" as const } }))];
}

export async function getChefAdvice(input: ChefAdviceRequestV1, signal?: AbortSignal): Promise<ChefAdviceWireV1 | null> {
  if (!isChefAdviceRequestV1(input) || !process.env.OPENAI_API_KEY) return null;
  try {
    const completion = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
      model: getChatModel("assistant_advice"), response_format: { type: "json_object" }, max_completion_tokens: 400,
      messages: [
        { role: "system", content: CHEF_ADVICE_SYSTEM_PROMPT },
        { role: "user", content: buildChefAdviceUserContent(input) }
      ]
    }, { signal, timeout: TYPESAFE_TIMEOUT_MS });
    return decodeChefAdviceWire(completion.choices[0]?.message?.content ?? "");
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

/** Décodage fermé, exporté pour vérifier les sorties fournisseur sans réseau. */
export function decodeChefAdviceWire(raw: string): ChefAdviceWireV1 | null {
  try {
    const wire: unknown = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, ""));
    return isChefAdviceWireV1(wire) ? wire : null;
  } catch { return null; }
}
