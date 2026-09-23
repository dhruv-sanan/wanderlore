# Fix Plan — Wanderlore Re-submission (attempt 2 of 3)

## Constraint

Current score locked: **95.79** (Orbital tag, >90, already secured). Bonus window (+2) gone. Max 3 submission attempts total, this is attempt 2. Any change must be **strictly additive/corrective** — zero risk of regressing Security 99 / Testing 99 / Accessibility 96 / Problem Statement 98, since those are near-max and have no margin to lose.

Target: push Efficiency 80 → higher, Code Quality 88 → higher. These are the only two params below 90.

Evidence gathered via full read of `app/`, `lib/`, `HLD.md`, `LLD.md`, `LEARNINGS.md`, `pre_prompt.md`, `HACKATHON_RULES.md`. No speculation — every finding below is file:line verified against actual source.

---

## Findings (evidence)

### Efficiency (80/100)

| # | Finding | File:line |
|---|---|---|
| E1 | `AttractionItem` inner component NOT wrapped in `React.memo` — only component of the 6 total missing it | `app/components/ItineraryBoard.tsx:14-31` |
| E2 | `paragraphsOf()` re-runs split/filter on every render of memoized `DiscoveryPanel` — derived value not memoized | `app/components/DiscoveryPanel.tsx:14-19`, called at `:77` |
| E3 | List rendered with `key={index}` instead of a stable content-derived key | `app/components/DiscoveryPanel.tsx:78` |
| E4 | `handleDiscover` has empty `useCallback` deps `[]` — works today but is a 76-line mixed-responsibility closure | `app/page.tsx:24-99` |
| E5 | `fetch` in `handleDiscover` has no `AbortSignal` — client never actively cancels its own request; `AbortSignal` propagation exists server-side only (`route.ts`→`gemini.ts`) | `app/page.tsx:58-62` |
| E6 | `setLogs` called once per parsed line inside the chunk loop; `pipeline.ts:24-46` proves 3 trace events (`validated`, `prompt_built`, `model_call`) fire before the first real network `await`, so one stream chunk can genuinely carry multiple lines | `app/page.tsx:73-87`, `lib/pipeline.ts:24-46` |

Confirmed correct (not touching): thinkingBudget=0 (`lib/gemini.ts:48`), maxOutputTokens=8192 (`:11`), single model call, retry policy (one immediate retry, no backoff, no timers — locked in `LLD.md:211`), state already split into 4 independent slices.

### Code Quality (88/100)

| # | Finding | File:line |
|---|---|---|
| C1 | `handleDiscover` mixes 6 responsibilities: state reset, event-apply, stream-parse, fetch, read-loop, error/retry | `app/page.tsx:24-99` |
| C2 | `AttractionItem` uses inline destructured prop type instead of a named `Props` interface — every other component has one | `app/components/ItineraryBoard.tsx:14` |
| C3 | `JSON.parse(trimmed) as TraceEvent` is a type assertion, not a runtime check — a syntactically valid but wrong-shape line would still reach `applyEvent` | `app/page.tsx:51` |
| C4 | `emit()`'s `streamController.enqueue(...)` is called from 9+ sites in `pipeline.ts` with no guard; if the stream is already closed (client disconnected mid-retry-decision), `enqueue` can throw and turn a benign disconnect into an unhandled error | `app/api/travel/route.ts:31-33`, `lib/pipeline.ts` (all `emit(...)` call sites) |

Confirmed correct (not touching): JSDoc present on all exported functions/interfaces in lib/ and all component Props, `types.ts` is sole type source (no duplication), zero `any`/`as any`, route.ts thin (65 lines), zero console.log/dead code, zero unused deps or orphan routes/components.

---

## Final fixes

### Group A — isolated component fixes (do first, independent files)

1. **E1 + C2**: wrap `AttractionItem` in `React.memo`, extract its inline prop type into a named `AttractionItemProps` interface with JSDoc, matching the other 5 components. Pure wrap + interface extraction, no logic/prop-shape change.
2. **E2**: wrap `paragraphsOf(payload.story.narrative)` in `useMemo` keyed on `payload.story.narrative`. Referentially transparent, no rendered-output change.
3. **E3**: replace `key={index}` with a stable content-derived key for the paragraph list. Display-only list, zero functional effect.

### Group B — one-line hardening (do second, isolated file)

4. **C4**: wrap the single `streamController.enqueue(encodeEvent(event))` call inside `emit` (`route.ts`) in a `try { ... } catch { /* stream already closed — nothing to do */ }`. This is the one choke point every `emit()` call in `pipeline.ts` goes through, so guarding it here fixes the "telemetry failure shouldn't crash the model call" risk everywhere at once, instead of special-casing the retry path. No-op on the success path — only changes behavior when the controller is already closed/aborted, which today would otherwise throw.

### Group C — one surgical `page.tsx` refactor (do last, single pass)

Bundling E4/C1/E5/E6/C3 into **one** consolidated pass instead of four separate edits to the same closure, to avoid layering micro-edits onto a fragile function and having to re-verify the cancellation/glassbox invariant four times instead of once.

5. **E4 + C1**: extract the stream-consumption logic (fetch → reader loop → NDJSON parse → event-apply) out of `handleDiscover` into a named helper, so `handleDiscover` becomes a thin orchestrator with a correct, non-empty dependency list. **Must stay local to `app/page.tsx` (or a co-located non-`lib/` file), not exported, and not added to `lib/`.** It is not a pure function (it does `fetch` + `setState` I/O), so it is not subject to the LLD `lib/` pure-function testing contract — same exemption LLD already gives `runTravelPipeline`/`callTravelModel`/React components. Exporting it or moving it into `lib/` would create a new untested surface against a Testing score that is already 99, with nothing to gain.
6. **E5**: add a `useRef<AbortController | null>` in `page.tsx`; abort any in-flight request before starting a new one; pass `signal` to `fetch`; abort on unmount cleanup. Closes the loop with the cancellation design that already exists server-side (`route.ts`'s shared `AbortController`) — the client gets an explicit, first-class way to cancel its own request instead of relying only on the browser tearing down the connection on tab close.
7. **E6**: accumulate parsed `TraceEvent`s from one chunk's lines into a local array; apply to `logs` with a single `setLogs((prev) => [...prev, ...batch])` call per chunk.
8. **C3**: add a small, **private, non-exported** `isTraceEvent(value: unknown): value is TraceEvent` guard co-located with the extracted stream helper (not added to `lib/`, not a new dependency). Checks `type`/`stage` are known enum values and `message`/`timestamp` have the right primitive types. A line that parses as JSON but fails the guard is skipped exactly like a JSON-parse failure is today.

**Locked invariants for the Group C refactor (must hold, verified after implementation):**
- one active request at a time (previous request aborted before a new one starts)
- `fetch` receives an `AbortSignal`
- exactly one `setLogs` call per stream chunk
- `setResult` / `setError` / terminal-event detection still run **per event**, never deferred or batched — a batched `logs` update must never delay error display or hide a result event
- a line that parses as JSON but fails the `isTraceEvent` shape guard is skipped, same as a JSON-parse failure is today
- valid events preserve stream order exactly
- `isRunning` always resets in `finally`

### Explicitly rejected — do not implement, under any circumstance

- **Zod or any new runtime-validation dependency.** Not in `LLD.md`'s frozen dependency list; the NDJSON stream is the app's own backend talking to its own frontend on the same origin, already shape-guarded server-side by `parseGeminiPayload` — not an external trust boundary. The private `isTraceEvent` guard above gets the real safety benefit without a new dependency.
- **Exponential backoff / timers / Event-Emitter rewrite of the retry path.** `LLD.md:211` locks retry policy in exact words: *"at most one immediate retry ... no backoff delay, ever."* A backoff needs a timer, and `setTimeout`/`setInterval` anywhere in `app/`/`lib/` is a hard DQ-scan failure — implementing this could disqualify the entire submission, not just cost rubric points. `onRetry` is not "piped through 8 stages" (it's declared once in `pipeline.ts` and passed one level into `callTravelModel`); it exists to satisfy the Glassbox mandate — the `model_retry` event must fire at the real moment the retry happens.

---

## Order of operations

1. Apply Group A (fixes 1–3) — mechanical, isolated, independent files.
2. Apply Group B (fix 4) — one line, isolated, independent of page.tsx work.
3. Apply Group C (fixes 5–8) as one single `page.tsx` pass, holding all locked invariants above simultaneously.
4. `npx vitest run`, `npm run build`, `npm run lint` — all must stay green, no new failures.
5. Manual re-verification: abort mid-call by refreshing (server-side path) **and** by triggering a client-side abort-then-resubmit (new client path); full glassbox sequence renders end-to-end with a real key; confirm a chunk carrying multiple trace lines still renders every line, in order, in `TraceLog`.
6. Do not touch anything already scoring 90+ (Security/Testing/Accessibility/Problem Statement) — no fixes proposed there, none needed.

## Why this won't push the score down

- Group A fixes are copy-paste-pattern changes matched against the app's own existing correct components.
- Group B is a single `try/catch` around an existing call; it is a no-op on every success-path run and only changes behavior in an already-broken-connection edge case that would otherwise throw uncaught.
- Group C touches the one locked invariant (cancellation/glassbox) and is therefore done as a single pass with a single, complete re-verification (vitest + build + lint + both abort paths + live smoke) instead of four separate risk windows.
- No new dependencies (`isTraceEvent` is private, not a package); no new files added to the locked `lib/` folder tree; no change to prompt/validation/retry-count/ordering logic — the parts of the rubric already scoring 96–99 are untouched by construction.

**Testing (99) / Security (99) regression check, explicit:**
- Testing: zero new exported functions added anywhere. `isTraceEvent` (fix 8) and the extracted stream-helper (fix 5) are both private/non-`lib/` — neither is subject to, nor expands, the "every exported pure function tested" surface. The locked 6-file / 11-function test suite is untouched.
- Security: zero fixes touch `lib/validation.ts`, `lib/prompt.ts`, or `lib/gemini.ts`'s key-handling/channel-separation logic — the entire security posture (server-only key, charset allowlist, systemInstruction/userContent split, schema pinning) is outside this plan's blast radius by construction. No new dependency is added (Zod explicitly rejected), so no new supply-chain surface either.

---

## Final Consensus Summary

| Area | Decision | Why |
|---|---|---|
| Component memo/interface (E1–E3) | Implement | Mechanical, evidence-backed, zero behavioral risk |
| `page.tsx` closure extraction (E4/C1) | Implement | Direct answer to the named "mega-closure" Code-Quality drag; HIGH-tier leverage |
| Client `AbortController` (E5) | Implement (reversed from initial rejection) | Initial rejection over-indexed on "can it break today"; the Efficiency rubric names AbortSignal propagation explicitly and it was server-only. Real, cheap gap to close |
| Batched `setLogs` (E6) | Implement, invariants locked explicitly | Real multi-line-chunk pattern proven from `pipeline.ts`'s own emit ordering, not hypothetical |
| Client shape guard (C3) | Implement in reduced form — private guard, no dependency | Full request (Zod) rejected as scope/dependency creep on a non-external boundary; the underlying safety concern was still valid and is met without a new dependency or lib/ surface |
| `emit` hardening (C4) | Implement, at the single choke point in `route.ts` | Better fix than guarding only the retry callback — same benefit, one line, no special-casing |
| Exponential backoff / timers / Event Emitter | Rejected, locked, never implement | Violates the hard DQ timer gate and the LLD-locked "no backoff delay, ever" retry policy; could disqualify the submission outright |

No open disagreements remain. All fixes are scoped to Efficiency/Code Quality causes already isolated by evidence; every rejection is tied to a specific locked invariant or DQ rule, not a judgment call.

**Awaiting approval to begin implementation.**
