import { callTravelModel } from "./gemini";
import { buildItinerary } from "./itinerary";
import { parseGeminiPayload } from "./parse";
import { buildTravelPrompt } from "./prompt";
import type { DiscoveryRequest, TraceEvent } from "./types";

/**
 * Runs the full Glassbox travel-discovery pipeline for one validated
 * request, emitting one `TraceEvent` per stage via `emit` at the genuine
 * `await` boundary where that stage actually completes. Checks
 * `signal.aborted` before each stage so a disconnected client stops further
 * compute immediately. On any failure, emits a single `error` event with a
 * human-readable message (never the raw API key or a stack trace); on a
 * client-initiated abort, returns silently without emitting anything
 * further.
 */
export async function runTravelPipeline(
  req: DiscoveryRequest,
  emit: (event: TraceEvent) => void,
  signal: AbortSignal
): Promise<void> {
  try {
    if (signal.aborted) return;
    emit({
      type: "trace",
      stage: "validated",
      message: `Validated request for ${req.destination} (${req.tripDays} day(s)).`,
      timestamp: Date.now(),
    });

    if (signal.aborted) return;
    const promptParts = buildTravelPrompt(req);
    emit({
      type: "trace",
      stage: "prompt_built",
      message: "Built the Gemini prompt for this destination.",
      timestamp: Date.now(),
    });

    if (signal.aborted) return;
    emit({
      type: "trace",
      stage: "model_call",
      message: "Calling the travel model.",
      timestamp: Date.now(),
    });

    const onRetry = (): void => {
      emit({
        type: "trace",
        stage: "model_retry",
        message: "Transient model error — retrying once immediately.",
        timestamp: Date.now(),
      });
    };

    const rawText = await callTravelModel(promptParts, signal, onRetry);

    if (signal.aborted) return;
    emit({
      type: "trace",
      stage: "model_response",
      message: "Received a response from the travel model.",
      timestamp: Date.now(),
    });

    if (signal.aborted) return;
    const payload = parseGeminiPayload(rawText);
    if (!payload) {
      emit({
        type: "trace",
        stage: "error",
        message: "The travel model returned a response that could not be understood.",
        timestamp: Date.now(),
      });
      return;
    }
    emit({
      type: "trace",
      stage: "parsed",
      message: `Parsed ${payload.attractions.length} attraction(s) from the model response.`,
      timestamp: Date.now(),
    });

    if (signal.aborted) return;
    const itinerary = buildItinerary(payload.attractions, req.tripDays, req.interests);
    emit({
      type: "trace",
      stage: "computed",
      message: itinerary.verdict,
      timestamp: Date.now(),
    });

    if (signal.aborted) return;
    emit({
      type: "result",
      stage: "done",
      message: "Travel discovery complete.",
      timestamp: Date.now(),
      result: { payload, itinerary },
    });
  } catch (err) {
    if (signal.aborted) {
      return;
    }
    const message = err instanceof Error ? err.message : "Something went wrong while planning this trip.";
    emit({
      type: "trace",
      stage: "error",
      message,
      timestamp: Date.now(),
    });
  }
}
