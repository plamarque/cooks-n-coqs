interface DurationCandidate {
  index: number;
  seconds: number;
}

const HOUR_PATTERN =
  /(\d+)\s*(?:heure(?:s)?|h(?![a-z]))\s*(?:(\d{1,2})(?:\s*(?:min(?:ute)?s?|mn)\b)?)?\s*(?:(\d{1,2})\s*(?:sec(?:onde)?s?|s)\b)?/i;
const MINUTE_PATTERN =
  /(\d+)\s*(?:min(?:ute)?s?|mn)\b\s*(?:(?:et\s*)?(\d+)\s*(?:sec(?:onde)?s?|s)\b)?/i;
const SECOND_PATTERN = /(\d+)\s*(?:sec(?:onde)?s?|s)\b/i;

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

export function extractStepTimerDurationSeconds(stepText?: string): number | undefined {
  const normalizedText = stepText?.trim();
  if (!normalizedText) {
    return undefined;
  }

  const candidates: DurationCandidate[] = [];

  const hourMatch = HOUR_PATTERN.exec(normalizedText);
  if (hourMatch) {
    const hours = parsePositiveInt(hourMatch[1]);
    const minutes = parsePositiveInt(hourMatch[2]);
    const seconds = parsePositiveInt(hourMatch[3]);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    pushCandidate(candidates, hourMatch.index, totalSeconds);
  }

  const minuteMatch = MINUTE_PATTERN.exec(normalizedText);
  if (minuteMatch) {
    const minutes = parsePositiveInt(minuteMatch[1]);
    const seconds = parsePositiveInt(minuteMatch[2]);
    const totalSeconds = minutes * 60 + seconds;
    pushCandidate(candidates, minuteMatch.index, totalSeconds);
  }

  const secondMatch = SECOND_PATTERN.exec(normalizedText);
  if (secondMatch) {
    const seconds = parsePositiveInt(secondMatch[1]);
    pushCandidate(candidates, secondMatch.index, seconds);
  }

  if (candidates.length === 0) {
    return undefined;
  }

  candidates.sort((left, right) => left.index - right.index);
  return candidates[0].seconds;
}
