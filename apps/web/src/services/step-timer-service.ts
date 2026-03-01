import { extractStepTimerDurationSeconds } from "../utils/step-timer";

const BFF_URL = import.meta.env.VITE_BFF_URL || "http://localhost:8787";
const durationCacheByStepText = new Map<string, number | undefined>();
const inFlightDurationByStepText = new Map<string, Promise<number | undefined>>();

function normalizeStepText(rawValue: string): string {
  return rawValue.replace(/\s+/g, " ").trim();
}

function normalizeDuration(rawDuration: unknown): number | undefined {
  if (typeof rawDuration !== "number" || !Number.isFinite(rawDuration)) {
    return undefined;
  }
  const roundedSeconds = Math.round(rawDuration);
  if (roundedSeconds <= 0) {
    return undefined;
  }
  return roundedSeconds;
}

async function fetchSemanticDuration(stepText: string): Promise<number | undefined> {
  try {
    const response = await fetch(`${BFF_URL}/api/step-timer-duration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepText }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      return undefined;
    }
    const payload = (await response.json()) as { durationSeconds?: number | null };
    return normalizeDuration(payload.durationSeconds);
  } catch {
    return undefined;
  }
}

export async function detectStepTimerDurationSeconds(
  rawStepText: string
): Promise<number | undefined> {
  const stepText = normalizeStepText(rawStepText);
  if (!stepText) {
    return undefined;
  }

  const cached = durationCacheByStepText.get(stepText);
  if (cached !== undefined || durationCacheByStepText.has(stepText)) {
    return cached;
  }

  const existingInFlight = inFlightDurationByStepText.get(stepText);
  if (existingInFlight) {
    return existingInFlight;
  }

  const localFallback = extractStepTimerDurationSeconds(stepText);
  const detectionPromise = fetchSemanticDuration(stepText)
    .then((semanticDuration) => semanticDuration ?? localFallback)
    .finally(() => {
      inFlightDurationByStepText.delete(stepText);
    });

  inFlightDurationByStepText.set(stepText, detectionPromise);
  const detectedDuration = await detectionPromise;
  durationCacheByStepText.set(stepText, detectedDuration);
  return detectedDuration;
}
