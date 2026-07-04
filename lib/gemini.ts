import "server-only";

import { GoogleGenAI } from "@google/genai";
import { classifyModelError } from "./errors";
import { TRAVEL_RESPONSE_SCHEMA } from "./prompt";

/** Model id used for every travel-discovery generation call. */
const MODEL_ID = "gemini-2.5-flash";

/** Output token ceiling for one generation call. */
const MAX_OUTPUT_TOKENS = 8192;

/** User-facing message for a 429 — the call is never retried in this case. */
const RATE_LIMITED_MESSAGE =
  "The model is rate limited right now — please resubmit in a moment.";

/** Module-cached SDK client, reused across requests instead of re-created per call. */
let cachedClient: { apiKey: string; client: GoogleGenAI } | null = null;

/**
 * Returns the shared GoogleGenAI client, constructing it lazily on first use
 * and rebuilding it only if the configured API key has changed.
 */
function getClient(apiKey: string): GoogleGenAI {
  if (cachedClient === null || cachedClient.apiKey !== apiKey) {
    cachedClient = { apiKey, client: new GoogleGenAI({ apiKey }) };
  }
  return cachedClient.client;
}

/**
 * Calls Gemini once to generate a travel-discovery payload for the given
 * prompt parts, returning the raw response text. `process.env.GEMINI_API_KEY`
 * is read here and only here in the codebase.
 *
 * Retry policy is driven exclusively by `classifyModelError`: a
 * `"transient"` failure (network error or HTTP 5xx) invokes `onRetry()` and
 * makes exactly one immediate second attempt — no backoff delay, ever.
 * `"rate_limited"` (HTTP 429) fails fast with a user-facing message and is
 * never retried. `"aborted"` is rethrown silently so the pipeline can treat
 * client disconnects as a no-op. `"fatal"` (any other 4xx, or an upstream
 * issue) throws a descriptive Error. Missing API key also throws a
 * descriptive Error before any network call is attempted.
 */
export async function callTravelModel(
  promptParts: { systemInstruction: string; userContent: string },
  signal: AbortSignal,
  onRetry: () => void
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini is not configured: GEMINI_API_KEY is missing.");
  }

  const client = getClient(apiKey);

  const attempt = async (): Promise<string> => {
    const response = await client.models.generateContent({
      model: MODEL_ID,
      contents: promptParts.userContent,
      config: {
        systemInstruction: promptParts.systemInstruction,
        responseMimeType: "application/json",
        responseSchema: TRAVEL_RESPONSE_SCHEMA,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingBudget: 0 },
        abortSignal: signal,
      },
    });

    const text = response.text;
    if (typeof text !== "string" || text.length === 0) {
      throw new Error("Gemini returned an empty response.");
    }
    return text;
  };

  try {
    return await attempt();
  } catch (err) {
    const errorClass = classifyModelError(err);

    if (errorClass === "aborted") {
      throw err;
    }

    if (errorClass === "rate_limited") {
      throw new Error(RATE_LIMITED_MESSAGE);
    }

    if (errorClass === "transient") {
      onRetry();
      try {
        return await attempt();
      } catch (retryErr) {
        const retryClass = classifyModelError(retryErr);
        if (retryClass === "aborted") {
          throw retryErr;
        }
        if (retryClass === "rate_limited") {
          throw new Error(RATE_LIMITED_MESSAGE);
        }
        throw new Error("The travel model is temporarily unavailable. Please try again.");
      }
    }

    throw new Error("The travel model could not generate a response for this request.");
  }
}
