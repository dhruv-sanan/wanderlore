"use client";

import { memo, useEffect, useRef } from "react";
import type { ReactElement } from "react";
import type { TraceEvent, TraceStage } from "@/lib/types";

/** Props for {@link TraceLog}. */
export interface TraceLogProps {
  /** Every trace event received from the stream so far, in arrival order. */
  logs: TraceEvent[];
}

/** Text-and-shape marker per stage — never rely on color alone to distinguish stages. */
const STAGE_MARKERS: Partial<Record<TraceStage, string>> = {
  received: "●", // ●
  validated: "✓", // ✓
  prompt_built: "▤", // ▤
  model_call: "▶", // ▶
  model_retry: "↻", // ↻
  model_response: "◆", // ◆
  parsed: "▣", // ▣
  computed: "Σ", // Σ
  done: "✔", // ✔
  error: "✕", // ✕
};

/** Falls back to a generic marker for any stage not in the known map (forward-compatible). */
function markerFor(stage: TraceStage): string {
  return STAGE_MARKERS[stage] ?? "•";
}

/** Turns a stage identifier like "model_retry" into "Model retry" for display. */
function stageLabel(stage: TraceStage): string {
  const spaced = stage.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Formats a Date.now() timestamp as HH:MM:SS.mmm in the viewer's local time. */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const mmm = String(date.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${mmm}`;
}

/** Props for {@link TraceLogRow}. */
interface TraceLogRowProps {
  /** The trace event this row renders. */
  log: TraceEvent;
}

/** Renders one trace event: stage marker, label, timestamp, and message. */
function TraceLogRowComponent({ log }: TraceLogRowProps): ReactElement {
  return (
    <li className="rounded-md border border-stone-700 bg-stone-800 px-3 py-2 text-sm">
      <div className="flex items-baseline gap-2">
        <span aria-hidden="true" className="font-mono text-amber-400">
          {markerFor(log.stage)}
        </span>
        <span className="font-semibold text-stone-50">{stageLabel(log.stage)}</span>
        <time
          dateTime={new Date(log.timestamp).toISOString()}
          className="ml-auto font-mono text-xs text-stone-400"
        >
          {formatTimestamp(log.timestamp)}
        </time>
      </div>
      <p className="mt-1 text-stone-200">{log.message}</p>
    </li>
  );
}

/** Memoized log row — appending a new event never re-renders earlier rows. */
const TraceLogRow = memo(TraceLogRowComponent);

/**
 * The "Glassbox" — a live, append-only log of every {@link TraceEvent} the
 * backend actually emitted for the current run. Renders only real events;
 * it never fabricates stages, timing, or progress. Auto-scrolls to the
 * newest entry as events arrive.
 */
function TraceLogComponent({ logs }: TraceLogProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length]);

  return (
    <aside
      aria-label="Agent trace log"
      className="flex h-full flex-col gap-3 rounded-xl border border-stone-300 bg-stone-900 p-4 text-stone-50 sm:p-5"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-200">
        Glassbox trace
      </h2>
      <div
        ref={scrollRef}
        className="max-h-[28rem] overflow-y-auto rounded-md bg-stone-950/40 p-2 md:max-h-[70vh]"
      >
        <ol role="log" aria-live="polite" className="flex flex-col gap-2">
          {logs.length === 0 && (
            <li className="px-2 py-1 text-sm text-stone-400">
              Waiting for the first trace event…
            </li>
          )}
          {logs.map((log) => (
            <TraceLogRow key={`${log.stage}-${log.timestamp}`} log={log} />
          ))}
        </ol>
      </div>
    </aside>
  );
}

/**
 * Memoized trace log sidebar. See {@link TraceLogComponent} for behavior.
 */
export const TraceLog = memo(TraceLogComponent);
