import type { TraceEvent } from "./types";

/** Shared encoder instance — stateless, so one is reused for every event. */
const encoder = new TextEncoder();

/**
 * Encodes one Glassbox trace event as an NDJSON line (a JSON-serialized
 * event followed by a single newline) for writing straight into the
 * response `ReadableStream`.
 */
export function encodeEvent(event: TraceEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}
