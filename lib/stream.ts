import type { TraceEvent } from "./types";

/**
 * Encodes one Glassbox trace event as an NDJSON line (a JSON-serialized
 * event followed by a single newline) for writing straight into the
 * response `ReadableStream`.
 */
export function encodeEvent(event: TraceEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}
