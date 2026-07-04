import { REQUEST_INVALID_MESSAGE, validateDiscoveryRequest } from "@/lib/validation";
import { runTravelPipeline } from "@/lib/pipeline";
import { encodeEvent } from "@/lib/stream";
import type { TraceEvent } from "@/lib/types";

/** Route handler runs on the Node.js runtime so the `@google/genai` SDK works. */
export const runtime = "nodejs";

/**
 * Handles a travel-discovery request: parses and validates the JSON body,
 * then streams NDJSON-framed Glassbox trace events from
 * `runTravelPipeline`. Cancellation is wired through a single shared
 * `AbortController` — aborted either by the incoming request signal or by
 * the stream's own `cancel()` — so a disconnected client stops backend
 * compute immediately. All business logic lives in lib/; this handler only
 * parses the body and wires the stream.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const emit = (event: TraceEvent): void => {
        streamController.enqueue(encodeEvent(event));
      };

      emit({
        type: "trace",
        stage: "received",
        message: "Received travel discovery request.",
        timestamp: Date.now(),
      });

      const validated = validateDiscoveryRequest(body);
      if (!validated) {
        emit({
          type: "trace",
          stage: "error",
          message: REQUEST_INVALID_MESSAGE,
          timestamp: Date.now(),
        });
        streamController.close();
        return;
      }

      await runTravelPipeline(validated, emit, controller.signal);
      streamController.close();
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
