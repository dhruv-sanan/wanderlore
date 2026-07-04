import { INTEREST_OPTIONS, type Attraction, type CulturalEvent, type GeminiTravelPayload, type HeritageStory, type HiddenGem } from "./types";

/** Category values Gemini is permitted to return for an attraction. */
const ALLOWED_CATEGORIES: readonly string[] = [...INTEREST_OPTIONS, "general"];

/**
 * Narrows an unknown value to a non-null, non-array object for property
 * access without resorting to `any`.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Type guard for a single Attraction, checking every field's shape. */
function isAttraction(value: unknown): value is Attraction {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.category === "string" &&
    ALLOWED_CATEGORIES.includes(value.category) &&
    typeof value.area === "string" &&
    typeof value.estimatedHours === "number" &&
    Number.isFinite(value.estimatedHours) &&
    typeof value.whyVisit === "string"
  );
}

/** Type guard for a single HiddenGem, checking every field's shape. */
function isHiddenGem(value: unknown): value is HiddenGem {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.localTip === "string"
  );
}

/** Type guard for a single CulturalEvent, checking every field's shape. */
function isCulturalEvent(value: unknown): value is CulturalEvent {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    typeof value.bestTime === "string"
  );
}

/** Type guard for the HeritageStory, checking every field's shape. */
function isHeritageStory(value: unknown): value is HeritageStory {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.title === "string" && typeof value.narrative === "string";
}

/** Type guard requiring every element of an unknown array to satisfy `guard`. */
function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

/**
 * Parses raw Gemini output text into a `GeminiTravelPayload`. JSON parsing
 * happens in a try/catch; the result is then manually shape-checked field by
 * field using `unknown` narrowing (no `any`). Returns `null` on any JSON
 * syntax error or shape mismatch — callers must treat that as a parse
 * failure, never retried.
 */
export function parseGeminiPayload(text: string): GeminiTravelPayload | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isRecord(candidate)) {
    return null;
  }

  const { attractions, hiddenGems, events, story } = candidate;

  if (!isArrayOf(attractions, isAttraction)) {
    return null;
  }
  if (!isArrayOf(hiddenGems, isHiddenGem)) {
    return null;
  }
  if (!isArrayOf(events, isCulturalEvent)) {
    return null;
  }
  if (!isHeritageStory(story)) {
    return null;
  }

  return { attractions, hiddenGems, events, story };
}
