/**
 * Pure error-classification helpers for Gemini model calls. This module has
 * no imports from lib/gemini.ts (or any I/O module) so it stays trivially
 * unit-testable in isolation from the SDK and the network.
 */

/**
 * Coarse failure bucket used to drive the single-retry policy in
 * lib/gemini.ts. "transient" is the only class eligible for the one
 * permitted immediate retry.
 */
export type ModelErrorClass = "transient" | "rate_limited" | "aborted" | "fatal";

/**
 * Narrows an unknown thrown value to a numeric HTTP status code, if one is
 * present, by defensively checking the shapes the `@google/genai` SDK (and
 * the underlying fetch layer) are known to throw: an explicit `status` or
 * `code` field, or — as a last resort — a 3-digit status embedded in the
 * error message.
 */
function extractStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) {
    return undefined;
  }
  const record = err as Record<string, unknown>;
  if (typeof record.status === "number") {
    return record.status;
  }
  if (typeof record.code === "number") {
    return record.code;
  }
  if (typeof record.message === "string") {
    const match = record.message.match(/\b([1-5]\d{2})\b/);
    if (match) {
      return Number(match[1]);
    }
  }
  return undefined;
}

/**
 * Detects whether an unknown thrown value represents an aborted request —
 * either the standard DOM `AbortError` name, or a wrapped error whose
 * `cause` chain carries an abort.
 */
function isAbortError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const record = err as Record<string, unknown>;
  if (record.name === "AbortError") {
    return true;
  }
  if ("cause" in record) {
    return isAbortError(record.cause);
  }
  return false;
}

/**
 * Detects fetch-level network failures (connection reset, DNS failure, TLS
 * errors, etc.) that surface as a `TypeError` from the underlying fetch
 * implementation rather than as an HTTP status code.
 */
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

/**
 * LOCKED classifier for Gemini call failures. HTTP 5xx responses and
 * network-level fetch failures classify as "transient" (the single
 * immediate retry is permitted); HTTP 429 classifies as "rate_limited"
 * (never retried, fails fast); an aborted request classifies as "aborted"
 * (rethrown silently by the caller); everything else — including 4xx
 * responses and upstream schema/parse issues — classifies as "fatal".
 */
export function classifyModelError(err: unknown): ModelErrorClass {
  if (isAbortError(err)) {
    return "aborted";
  }

  const status = extractStatus(err);
  if (status === 429) {
    return "rate_limited";
  }
  if (status !== undefined && status >= 500 && status < 600) {
    return "transient";
  }
  if (isNetworkError(err)) {
    return "transient";
  }

  return "fatal";
}
