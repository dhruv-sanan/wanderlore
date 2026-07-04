"use client";

import { useCallback, useState } from "react";
import type { DiscoveryRequest, TraceEvent, TravelResult } from "@/lib/types";
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

export default function Home() {
  const [logs, setLogs] = useState<TraceEvent[]>([]);
  const [result, setResult] = useState<TravelResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleDiscover = useCallback(async (request: DiscoveryRequest) => {
    setIsRunning(true);
    setError(null);
    setResult(null);
    setLogs([]);

    let sawTerminalEvent = false;

    const applyEvent = (event: TraceEvent) => {
      setLogs((previous) => [...previous, event]);
      if (event.type === "result" && event.result) {
        setResult(event.result);
      }
      if (event.stage === "error") {
        setError(event.message);
      }
      if (event.stage === "done" || event.stage === "error") {
        sawTerminalEvent = true;
      }
    };

    const parseAndApply = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      try {
        applyEvent(JSON.parse(trimmed) as TraceEvent);
      } catch {
        // Malformed line from the stream — skip it rather than crash the reader.
      }
    };

    try {
      const response = await fetch("/api/travel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok || !response.body) {
        setError(UNREACHABLE_MESSAGE);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            parseAndApply(line);
          }
        }
        if (done) {
          parseAndApply(buffer);
          break;
        }
      }

      if (!sawTerminalEvent) {
        setError(UNEXPECTED_END_MESSAGE);
      }
    } catch {
      if (!sawTerminalEvent) {
        setError(UNREACHABLE_MESSAGE);
      }
    } finally {
      setIsRunning(false);
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
