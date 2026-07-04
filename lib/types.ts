/**
 * Frozen shared type contract for Wanderlore. Every module imports from here;
 * this file is never redefined or duplicated elsewhere. See LLD.md §2.
 */

/** User input from the control panel (post-parse, pre-validation shape). */
export interface DiscoveryRequest {
  /** 2-80 chars after sanitization; must match the place-name charset allowlist. */
  destination: string;
  /** Integer 1-7 — single-destination cultural trip scope (product decision, not a hidden cap). */
  tripDays: number;
  /** 0-6 items, each a member of INTEREST_OPTIONS. */
  interests: string[];
}

/** Interest whitelist — single source for form checkboxes, validation, and the Gemini response schema enum. */
export const INTEREST_OPTIONS = [
  "history",
  "food",
  "art",
  "nature",
  "festivals",
  "crafts",
] as const;

/** One selectable interest, derived from INTEREST_OPTIONS. */
export type Interest = (typeof INTEREST_OPTIONS)[number];

/** One attraction proposed by the model. */
export interface Attraction {
  /** Attraction name. */
  name: string;
  /** Short description of the attraction. */
  description: string;
  /** Interest category, or "general" when it matches no listed interest. */
  category: Interest | "general";
  /** Neighborhood/district label (model-proposed) — input to deterministic same-area day clustering. */
  area: string;
  /** Model estimate of hours needed on-site — input to deterministic day packing. */
  estimatedHours: number;
  /** Heritage/cultural significance framing for why this attraction is worth visiting. */
  whyVisit: string;
}

/** A hidden gem suggestion connecting the traveler to an authentic local experience. */
export interface HiddenGem {
  /** Gem name. */
  name: string;
  /** Short description of the gem. */
  description: string;
  /** Local tip framing an authentic cultural experience. */
  localTip: string;
}

/** A local cultural event or experience suggestion. */
export interface CulturalEvent {
  /** Event name. */
  name: string;
  /** Short description of the event. */
  description: string;
  /** Best time to attend, e.g. "evenings" or "October festival season". */
  bestTime: string;
}

/** An immersive heritage story promoting the destination's culture. */
export interface HeritageStory {
  /** Story title. */
  title: string;
  /** Immersive storytelling narrative (one or more paragraphs). */
  narrative: string;
}

/** Exact shape Gemini must return, mirroring TRAVEL_RESPONSE_SCHEMA in lib/prompt.ts. */
export interface GeminiTravelPayload {
  /** Proposed attractions — schema caps at 14; prompt requests min(2*tripDays+2, 14). */
  attractions: Attraction[];
  /** Hidden gem suggestions — capped at 4. */
  hiddenGems: HiddenGem[];
  /** Local cultural event suggestions — capped at 4. */
  events: CulturalEvent[];
  /** Single immersive heritage story. */
  story: HeritageStory;
}

/** One packed day of the itinerary — computed deterministically, never model-generated. */
export interface ItineraryDay {
  /** 1-based day number. */
  day: number;
  /** Attractions scheduled on this day. */
  attractions: Attraction[];
  /** Sum of estimatedHours across this day's attractions. */
  totalHours: number;
}

/** Deterministic packing result. */
export interface ItineraryResult {
  /** Packed days, one entry per trip day. */
  days: ItineraryDay[];
  /** Attractions that did not fit within the trip's day/hour capacity. */
  unplaced: Attraction[];
  /** Deterministic coverage summary sentence. */
  verdict: string;
}

/** Full payload delivered in the terminal "result" stream event. */
export interface TravelResult {
  /** Raw Gemini-generated payload. */
  payload: GeminiTravelPayload;
  /** Deterministically computed itinerary derived from payload.attractions. */
  itinerary: ItineraryResult;
}

/** Glassbox pipeline stage names, in emission order (model_retry is conditional). */
export type TraceStage =
  | "received"
  | "validated"
  | "prompt_built"
  | "model_call"
  | "model_retry"
  | "model_response"
  | "parsed"
  | "computed"
  | "done"
  | "error";

/** One NDJSON-framed Glassbox trace event, emitted at a genuine await boundary. */
export interface TraceEvent {
  /** "result" only on the terminal event carrying the full TravelResult; "trace" otherwise. */
  type: "trace" | "result";
  /** Pipeline stage this event reports. */
  stage: TraceStage;
  /** Human-readable message describing this stage's outcome. */
  message: string;
  /** Date.now() at emission time — real, never simulated. */
  timestamp: number;
  /** Present only on the terminal type:"result" event. */
  result?: TravelResult;
}
