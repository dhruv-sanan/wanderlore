"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscoveryRequest, TraceEvent, TraceStage, TravelResult } from "@/lib/types";
import { DiscoveryForm } from "./components/DiscoveryForm";
import { TraceLog } from "./components/TraceLog";
import { ItineraryBoard } from "./components/ItineraryBoard";
import { DiscoveryPanel } from "./components/DiscoveryPanel";
import { ErrorBanner } from "./components/ErrorBanner";

/** Generic, user-facing fallback shown when the stream ends without a terminal event. */
const UNEXPECTED_END_MESSAGE =
  "The connection ended before the trip was finished. Please try again.";

/** Generic, user-facing fallback shown when the request itself could not be made. */
const UNREACHABLE_MESSAGE = "The travel service could not be reached. Please try again.";

/** Every valid `TraceEvent.stage` value — mirrors `TraceStage` for the runtime shape guard. */
const TRACE_STAGES = new Set<TraceStage>([
  "received",
  "validated",
  "prompt_built",
  "model_call",
  "model_retry",
  "model_response",
  "parsed",
  "computed",
  "done",
  "error",
]);

/**
 * Runtime shape guard for one parsed NDJSON line. A line that parses as
 * JSON but fails this check is skipped exactly like a JSON-parse failure —
 * it never reaches `applyEvent`.
 */
function isTraceEvent(value: unknown): value is TraceEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.type === "trace" || candidate.type === "result") &&
    typeof candidate.stage === "string" &&
    TRACE_STAGES.has(candidate.stage as TraceStage) &&
    typeof candidate.message === "string" &&
    typeof candidate.timestamp === "number"
  );
}

/** Callbacks the caller supplies to react to a streamed discovery run. */
interface StreamCallbacks {
  /** Applied once per valid event, in stream order — never deferred or batched. */
  onEvent: (event: TraceEvent) => void;
  /** Applied at most once per stream chunk, with every valid event that chunk contained; skipped for chunks carrying none. */
  onChunk: (batch: TraceEvent[]) => void;
}

/**
 * Fetches the travel-discovery stream and drives it to completion: issues
 * the POST with the given `AbortSignal`, reads NDJSON chunks, applies each
 * valid event via `onEvent` in order, and flushes at most one batched
 * `onChunk` call per chunk read from the stream. Not a pure function (it performs
 * `fetch` and drives the caller's state updates), so it stays local to this
 * file rather than moving into `lib/`.
 */
async function runDiscoveryStream(
  request: DiscoveryRequest,
  signal: AbortSignal,
  { onEvent, onChunk }: StreamCallbacks
): Promise<{ sawTerminalEvent: boolean; reachable: boolean }> {
  let sawTerminalEvent = false;
  let buffer = "";

  const applyLine = (line: string, batch: TraceEvent[]) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (!isTraceEvent(parsed)) {
      return;
    }
    onEvent(parsed);
    if (parsed.stage === "done" || parsed.stage === "error") {
      sawTerminalEvent = true;
    }
    batch.push(parsed);
  };

  const response = await fetch("/api/travel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok || !response.body) {
    return { sawTerminalEvent, reachable: false };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      const batch: TraceEvent[] = [];
      for (const line of lines) {
        applyLine(line, batch);
      }
      if (batch.length > 0) {
        onChunk(batch);
      }
    }
    if (done) {
      const batch: TraceEvent[] = [];
      applyLine(buffer, batch);
      if (batch.length > 0) {
        onChunk(batch);
      }
      break;
    }
  }

  return { sawTerminalEvent, reachable: true };
}

export default function Home() {
  const [logs, setLogs] = useState<TraceEvent[]>([]);
  const [result, setResult] = useState<TravelResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleDiscover = useCallback(async (request: DiscoveryRequest) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const isCurrent = () => abortControllerRef.current === controller;

    setIsRunning(true);
    setError(null);
    setResult(null);
    setLogs([]);

    const applyEvent = (event: TraceEvent) => {
      if (!isCurrent()) {
        return;
      }
      if (event.type === "result" && event.result) {
        setResult(event.result);
      }
      if (event.stage === "error") {
        setError(event.message);
      }
    };

    try {
      const { sawTerminalEvent, reachable } = await runDiscoveryStream(request, controller.signal, {
        onEvent: applyEvent,
        onChunk: (batch) => {
          if (!isCurrent()) {
            return;
          }
          setLogs((previous) => [...previous, ...batch]);
        },
      });

      if (!isCurrent()) {
        return;
      }

      if (!reachable) {
        setError(UNREACHABLE_MESSAGE);
        return;
      }

      if (!sawTerminalEvent) {
        setError(UNEXPECTED_END_MESSAGE);
      }
    } catch (err) {
      if (!isCurrent() || (err instanceof DOMException && err.name === "AbortError")) {
        return;
      }
      setError(UNREACHABLE_MESSAGE);
    } finally {
      if (isCurrent()) {
        setIsRunning(false);
      }
    }
  }, []);

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-300 bg-white px-4 py-6 sm:px-8">
        <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">Wanderlore</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-700 sm:text-base">
          Plan a cultural trip of up to 7 days — one destination, a hand-picked mix of
          attractions, hidden gems, and a heritage story, packed into a realistic
          day-by-day schedule.
        </p>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 sm:px-8 md:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-w-0 flex-col gap-6">
          <DiscoveryForm onSubmit={handleDiscover} isRunning={isRunning} />
          {error && <ErrorBanner message={error} />}
          {result && (
            <>
              <ItineraryBoard itinerary={result.itinerary} />
              <DiscoveryPanel payload={result.payload} />
            </>
          )}
        </main>

        <TraceLog logs={logs} />
      </div>
    </div>
  );
}
