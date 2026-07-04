import { INTEREST_OPTIONS, type DiscoveryRequest, type Interest } from "./types";

/** Minimum accepted destination length after sanitization. */
const MIN_DESTINATION_LENGTH = 2;

/** Maximum accepted destination length after sanitization. */
const MAX_DESTINATION_LENGTH = 80;

/** Maximum number of interests accepted, mirroring the DiscoveryRequest contract. */
const MAX_INTERESTS = 6;

/** Minimum accepted trip length in days. */
const MIN_TRIP_DAYS = 1;

/** Maximum accepted trip length in days. */
const MAX_TRIP_DAYS = 7;

/**
 * Place-name charset allowlist: unicode letters/marks/digits, whitespace,
 * and the punctuation real place names use. Accepts inputs like
 * "St. John's", "Baden-Baden", "Washington, D.C.", "Dún Laoghaire",
 * "Area 51", and "Trinidad & Tobago"; rejects code/markup/shell metacharacters.
 */
const DESTINATION_CHARSET = /^[\p{L}\p{M}\p{N}\s.,'&()/-]+$/u;

/**
 * Matches ASCII control characters (C0 controls plus DEL), built from
 * explicit char codes so the pattern cannot be accidentally collapsed into a
 * visible-character range.
 */
const CONTROL_CHAR_PATTERN = new RegExp(
  "[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + String.fromCharCode(127) + "]",
  "g"
);

/**
 * Human-readable description of the destination charset allowlist. Surfaced
 * to the end user (via the route's error trace event) when validation
 * rejects a destination for containing disallowed characters.
 */
export const DESTINATION_ALLOWED_MESSAGE =
  "Destination may contain letters, numbers, spaces and . , ' & ( ) / -";

/**
 * Generic validation failure message used whenever the request shape or a
 * non-destination field is invalid (missing/wrong-typed fields, out-of-range
 * trip length, or an unrecognized interest).
 */
export const REQUEST_INVALID_MESSAGE =
  "Please provide a destination (2-80 characters), a trip length of 1-7 days, and up to 6 known interests.";

/**
 * Trims a raw string, strips ASCII control characters and angle brackets
 * (`<`/`>`), and caps the result at 80 characters.
 */
export function sanitizeText(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(CONTROL_CHAR_PATTERN, "")
    .replace(/[<>]/g, "")
    .trim();
  return cleaned.slice(0, MAX_DESTINATION_LENGTH);
}

/**
 * Validates and narrows an unknown request body into a typed
 * `DiscoveryRequest`, or returns `null` if any field fails validation.
 * Rules: destination is 2-80 chars after sanitization and matches the
 * place-name charset allowlist; tripDays is an integer 1-7; interests is a
 * 0-6 item array where every entry is a member of `INTEREST_OPTIONS`.
 */
export function validateDiscoveryRequest(body: unknown): DiscoveryRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;

  const rawDestination = record.destination;
  if (typeof rawDestination !== "string") {
    return null;
  }
  // Charset compliance is checked against the trimmed-but-unstripped input:
  // disallowed characters (control chars, `<`/`>`, shell/SQL metacharacters)
  // must reject the request outright rather than being silently stripped by
  // sanitizeText and letting the remainder slip through as "valid".
  const destination = rawDestination.trim();
  if (
    destination.length < MIN_DESTINATION_LENGTH ||
    destination.length > MAX_DESTINATION_LENGTH ||
    !DESTINATION_CHARSET.test(destination)
  ) {
    return null;
  }

  const tripDays = record.tripDays;
  if (
    typeof tripDays !== "number" ||
    !Number.isInteger(tripDays) ||
    tripDays < MIN_TRIP_DAYS ||
    tripDays > MAX_TRIP_DAYS
  ) {
    return null;
  }

  const rawInterests = record.interests;
  if (!Array.isArray(rawInterests) || rawInterests.length > MAX_INTERESTS) {
    return null;
  }
  const interests: Interest[] = [];
  const allowedInterests: readonly string[] = INTEREST_OPTIONS;
  for (const item of rawInterests) {
    if (typeof item !== "string" || !allowedInterests.includes(item)) {
      return null;
    }
    interests.push(item as Interest);
  }

  return { destination, tripDays, interests };
}
