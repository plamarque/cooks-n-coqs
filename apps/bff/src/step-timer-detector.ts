import OpenAI from "openai";

interface DurationCandidate {
  index: number;
  seconds: number;
}

interface TimerDetectionPayload {
  durationSeconds?: number | null;
}

const HOUR_PATTERN =
  /(\d+)\s*(?:heure(?:s)?|h(?![a-z]))\s*(?:(\d{1,2})(?:\s*(?:min(?:ute)?s?|mn)\b)?)?\s*(?:(\d{1,2})\s*(?:sec(?:onde)?s?|s)\b)?/i;
const MINUTE_PATTERN =
  /(\d+)\s*(?:min(?:ute)?s?|mn)\b\s*(?:(?:et\s*)?(\d+)\s*(?:sec(?:onde)?s?|s)\b)?/i;
const SECOND_PATTERN = /(\d+)\s*(?:sec(?:onde)?s?|s)\b/i;
const MAX_DURATION_SECONDS = 12 * 3600;

function parsePositiveInt(rawValue: string | undefined): number {
  if (!rawValue) {
    return 0;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
}

function pushCandidate(
  candidates: DurationCandidate[],
  index: number | undefined,
  seconds: number
): void {
  if (index === undefined || seconds <= 0) {
    return;
  }
  candidates.push({ index, seconds });
}

function extractDurationWithRegex(stepText: string): number | undefined {
  const normalizedText = stepText.trim();
  if (!normalizedText) {
    return undefined;
  }

  const candidates: DurationCandidate[] = [];

  const hourMatch = HOUR_PATTERN.exec(normalizedText);
  if (hourMatch) {
    const hours = parsePositiveInt(hourMatch[1]);
    const minutes = parsePositiveInt(hourMatch[2]);
    const seconds = parsePositiveInt(hourMatch[3]);
    pushCandidate(candidates, hourMatch.index, hours * 3600 + minutes * 60 + seconds);
  }

  const minuteMatch = MINUTE_PATTERN.exec(normalizedText);
  if (minuteMatch) {
    const minutes = parsePositiveInt(minuteMatch[1]);
    const seconds = parsePositiveInt(minuteMatch[2]);
    pushCandidate(candidates, minuteMatch.index, minutes * 60 + seconds);
  }

  const secondMatch = SECOND_PATTERN.exec(normalizedText);
  if (secondMatch) {
    pushCandidate(candidates, secondMatch.index, parsePositiveInt(secondMatch[1]));
  }

  if (candidates.length === 0) {
    return undefined;
  }

  candidates.sort((left, right) => left.index - right.index);
  const detectedSeconds = candidates[0].seconds;
  return detectedSeconds > 0 ? detectedSeconds : undefined;
}

function sanitizeStepText(rawText: string): string {
  return rawText.replace(/\s+/g, " ").trim();
}

function parseDetectionPayload(rawResponse: string): TimerDetectionPayload | null {
  const jsonCandidate = rawResponse
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(jsonCandidate) as TimerDetectionPayload;
  } catch {
    return null;
  }
}

function normalizeDuration(duration: unknown): number | undefined {
  if (typeof duration !== "number") {
    return undefined;
  }
  if (!Number.isFinite(duration)) {
    return undefined;
  }
  const roundedSeconds = Math.round(duration);
  if (roundedSeconds <= 0 || roundedSeconds > MAX_DURATION_SECONDS) {
    return undefined;
  }
  return roundedSeconds;
}

async function detectDurationWithOpenAi(stepText: string): Promise<number | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return undefined;
  }

  const prompt = `Tu aides une app de cuisine à proposer un timer pour UNE étape.
Retourne uniquement un JSON valide, sans markdown :
{"durationSeconds": number|null}

Règles :
- durationSeconds = durée de countdown pertinente pour cette étape, en secondes.
- Si aucune durée à minuter n'est indiquée (même implicitement), mets null.
- Comprendre les formulations approximatives (ex: "une dizaine de minutes" -> 600).
- Si la durée est une plage (ex: "20 à 25 minutes"), choisir la borne haute.
- Si plusieurs durées apparaissent, choisir la plus pertinente pour l'action principale de l'étape.
- Ne retourne jamais de texte hors JSON.

Étape :
${stepText.slice(0, 2000)}`;

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [{ role: "user", content: prompt }]
    });
    const rawContent = completion.choices[0]?.message?.content?.trim();
    if (!rawContent) {
      return undefined;
    }
    const payload = parseDetectionPayload(rawContent);
    return normalizeDuration(payload?.durationSeconds);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Step timer AI detection failed", error);
    return undefined;
  }
}

export async function detectStepTimerDurationSeconds(
  rawStepText: string
): Promise<number | undefined> {
  const stepText = sanitizeStepText(rawStepText);
  if (!stepText) {
    return undefined;
  }

  const fallbackDuration = extractDurationWithRegex(stepText);
  const aiDuration = await detectDurationWithOpenAi(stepText);
  return aiDuration ?? fallbackDuration;
}
