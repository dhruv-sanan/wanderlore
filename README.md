# Wanderlore

## Chosen Vertical

**Destination Discovery & Cultural Experiences.** Wanderlore is a single-destination
cultural trip planner for trips of **1–7 days**. The traveler persona is someone who
already knows *where* they're going — a city or region — but wants a curated,
locally-grounded plan of what to actually do there: the must-see heritage attractions,
the hidden gems a guidebook would miss, the cultural events worth timing a visit
around, and a short immersive story that puts the destination's history and culture
into context before they arrive. The product scope is explicit and deliberately
narrow: one destination, one trip, 1–7 days, a fixed set of interest categories —
not a multi-city itinerary builder, not a booking engine, not a transit router.

## Approach and Logic

Wanderlore splits responsibility cleanly between the model and deterministic code:
the model *proposes*, code *computes*. A single structured-output Gemini call (using
`responseSchema` and bounded output tokens) generates the creative content —
attractions, hidden gems, cultural events, and the heritage story — as one bounded
API request. Everything about *scheduling* is then decided by pure, deterministic
TypeScript: `rankByInterests` reorders attractions by the traveler's selected
interests, `normalizeArea` collapses case/spacing/punctuation drift in the model's
neighborhood labels, `clusterByArea` groups same-neighborhood attractions so the
itinerary doesn't obviously zigzag across town, and `buildItinerary` packs everything
into day-sized (8-hour) blocks. This area grouping reduces obvious zigzag risk — it
is neighborhood grouping, not real transit-time routing.

Response caching is deliberately **omitted**: contest rules require every run to
invoke a live model call, so caching previous responses would violate that
constraint. Resilience is intentionally minimal and transparent: at most **one**
retry is attempted, and only for network failures or 5xx-class errors — surfaced to
the client as a `model_retry` trace event — while a 429 (rate limit) fails fast with
a message asking the user to resubmit. An `AbortSignal` is threaded through the
request so a disconnected client stops further local compute immediately rather than
continuing to burn CPU on an itinerary nobody will see. Efficiency comes from doing
exactly one bounded API call per request and from memoizing the React components
that render the (potentially large) attraction/day lists.

## How the Solution Works

The request lifecycle, in order:

1. **Form → validated input.** The traveler submits a destination, trip length, and
   interests. `validateDiscoveryRequest` enforces a place-name charset allowlist on
   the destination and whitelists interests against `INTEREST_OPTIONS`.
2. **Prompt construction.** `buildTravelPrompt` builds a `systemInstruction` /
   `userContent` pair with strict channel separation: the destination and other
   user-controlled text live only in `userContent`, wrapped in injection-guard
   delimiters, while behavioral instructions live only in `systemInstruction`.
3. **Live Gemini call (abortable).** The prompt is sent to Gemini with a pinned
   response schema; the call honors `AbortSignal` cancellation.
4. **Shape-guarded parse.** `parseGeminiPayload` validates the raw model text
   against the exact `GeminiTravelPayload` shape (including per-list caps) before
   any of it is trusted.
5. **Deterministic itinerary packing.** `buildItinerary` (and its helpers) turn the
   parsed attractions into day-by-day plans with zero further model involvement.
6. **NDJSON Glassbox stream.** Every pipeline stage emits a `TraceEvent` at a real
   `await` boundary, streamed as newline-delimited JSON, so the client can show
   genuine progress rather than a fake spinner.
7. **Rendered results.** The final `result` event carries the full `TravelResult`,
   which the UI renders.

### Setup

```bash
npm i
cp .env.local.example .env.local   # then fill in GEMINI_API_KEY
npm run dev
npm test
```

## Assumptions Made

- An 8-hour day is the sightseeing budget (`HOURS_PER_DAY`); model-provided
  `estimatedHours` are treated as estimates, and packing is deterministic *given*
  those estimates — the model doesn't get a second vote.
- Neighborhood/`area` labels are model-proposed and normalized (case, spacing,
  punctuation) before grouping. Grouping by area reduces obvious zigzag risk but is
  **not** transit-time routing — real travel time between neighborhoods is out of
  scope.
- A "destination" may be a city or a broader region; no geocoding or place
  disambiguation is performed.
- Trip length is capped at 7 days as a deliberate product-scope decision (this is a
  single-destination cultural trip planner, not a multi-city tour), and the bounded
  attraction budget of up to 14 attractions covers roughly two per day at that cap.
- The interests whitelist (`INTEREST_OPTIONS`) bounds the scope of what the model can
  be asked for and what the UI can request — it is not meant to be exhaustive of all
  possible travel interests.
- Prompt-injection defense is layered **containment**, not prevention: input
  validation, system/user channel separation, response schema pinning, a
  shape-guarded parse step, and escaped rendering all reduce blast radius, but none
  of them individually (nor all together) guarantee the model can't be steered.
  Residual risk is limited to odd prose surfacing in travel-shaped fields (e.g. a
  strange `whyVisit` sentence), not code execution or data exfiltration.
- Aborting a request stops further **local** compute, but cannot guarantee zero
  token billing on the Gemini side for a call that was already dispatched before the
  abort was observed.
- No persistence by design — nothing is stored between requests; every run is a
  fresh live model call, matching the caching-omission decision above.
