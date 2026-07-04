import type { Attraction, ItineraryDay, ItineraryResult } from "./types";

/** Maximum sightseeing hours packed into a single itinerary day. */
export const HOURS_PER_DAY = 8;

/** Floor applied to zero/negative `estimatedHours` before packing. */
const MIN_ATTRACTION_HOURS = 0.5;

/**
 * Splits attractions into a matched partition (category matches one of the
 * selected interests) and an unmatched partition, preserving original order
 * within each. An empty `interests` list puts everything in `unmatched`;
 * `"general"` never counts as a match. Shared by `rankByInterests` (which
 * concatenates the two) and `buildItinerary` (which clusters them
 * separately before concatenating).
 */
function partitionByInterests(
  attractions: Attraction[],
  interests: string[]
): { matched: Attraction[]; unmatched: Attraction[] } {
  if (interests.length === 0) {
    return { matched: [], unmatched: [...attractions] };
  }
  const interestSet = new Set(interests);
  const matched: Attraction[] = [];
  const unmatched: Attraction[] = [];
  for (const attraction of attractions) {
    if (attraction.category !== "general" && interestSet.has(attraction.category)) {
      matched.push(attraction);
    } else {
      unmatched.push(attraction);
    }
  }
  return { matched, unmatched };
}

/**
 * Stably partitions attractions into two groups — those whose `category`
 * matches one of the traveler's selected interests first, followed by the
 * rest — preserving original order within each group. An empty `interests`
 * list leaves the input order unchanged; `"general"` never counts as a
 * match.
 */
export function rankByInterests(attractions: Attraction[], interests: string[]): Attraction[] {
  const { matched, unmatched } = partitionByInterests(attractions, interests);
  return [...matched, ...unmatched];
}

/**
 * Canonicalizes a noisy model-proposed area label: lowercases, trims,
 * collapses internal whitespace runs to a single space, and strips
 * leading/trailing punctuation. Blank/whitespace-only input returns `""`,
 * which `clusterByArea` treats as a non-clusterable singleton that keeps its
 * original position.
 */
export function normalizeArea(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const collapsed = trimmed.toLowerCase().replace(/\s+/g, " ");
  const stripped = collapsed.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  return stripped;
}

/**
 * Stably regroups attractions so that attractions sharing the same
 * normalized `area` become adjacent, with area blocks ordered by each
 * area's first appearance in the input. Attractions whose normalized area is
 * `""` never cluster — they stay in their original position. This reduces
 * obvious day-to-day zigzag risk; it is grouping only, not routing.
 */
export function clusterByArea(attractions: Attraction[]): Attraction[] {
  const groups = new Map<string, Attraction[]>();

  attractions.forEach((attraction) => {
    const key = normalizeArea(attraction.area);
    if (key === "") {
      return;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)?.push(attraction);
  });

  const result: Attraction[] = [];
  const consumed = new Set<string>();

  attractions.forEach((attraction) => {
    const key = normalizeArea(attraction.area);
    if (key === "") {
      result.push(attraction);
      return;
    }
    if (consumed.has(key)) {
      return;
    }
    consumed.add(key);
    const group = groups.get(key);
    if (group) {
      result.push(...group);
    }
  });

  return result;
}

/**
 * Clamps an attraction's `estimatedHours` to a sane minimum, treating any
 * zero or negative model estimate as a nominal 0.5-hour visit.
 */
function clampHours(hours: number): number {
  return hours > 0 ? hours : MIN_ATTRACTION_HOURS;
}

/**
 * Packs an ordered list of attractions into `tripDays` days, capping each
 * day at `HOURS_PER_DAY` hours. Fill is sequential and forward-only — once a
 * day is advanced past, it is never revisited, which keeps area-clustered
 * runs together on one day when they fit. To avoid densely cramming early
 * days full while later days sit empty, each day also targets an even share
 * of the attraction count (`ceil(total / tripDays)`); a day advances once it
 * hits either that count target or the hour cap, whichever comes first.
 * Attractions that still do not fit once `tripDays` is exhausted are
 * returned as `overflow`, in the order they were dropped.
 */
function packDays(
  ordered: Attraction[],
  tripDays: number
): { days: ItineraryDay[]; overflow: Attraction[] } {
  const days: ItineraryDay[] = Array.from({ length: tripDays }, (_, index) => ({
    day: index + 1,
    attractions: [],
    totalHours: 0,
  }));
  const overflow: Attraction[] = [];
  const perDayTarget = tripDays > 0 ? Math.ceil(ordered.length / tripDays) : 0;
  let current = 0;

  for (const attraction of ordered) {
    const hours = clampHours(attraction.estimatedHours);
    while (
      current < tripDays &&
      (days[current].attractions.length >= perDayTarget ||
        days[current].totalHours + hours > HOURS_PER_DAY)
    ) {
      current += 1;
    }
    if (current >= tripDays) {
      overflow.push(attraction);
      continue;
    }
    days[current].attractions.push(attraction);
    days[current].totalHours += hours;
  }

  return { days, overflow };
}

/**
 * Deterministic sentence summarizing itinerary coverage: every attraction
 * fit, some overflowed (named explicitly), or the schedule is light
 * relative to the trip length (free-time phrasing, not an error).
 */
export function summarizeVerdict(days: ItineraryDay[], unplaced: Attraction[], tripDays: number): string {
  if (unplaced.length > 0) {
    const names = unplaced.map((attraction) => attraction.name).join(", ");
    return `All ${tripDays} day(s) are full; ${unplaced.length} attraction(s) did not fit and were left unplaced: ${names}.`;
  }

  const totalHours = days.reduce((sum, day) => sum + day.totalHours, 0);
  const scheduledCount = days.reduce((sum, day) => sum + day.attractions.length, 0);
  const averageHours = tripDays > 0 ? totalHours / tripDays : 0;

  if (scheduledCount === 0) {
    return `No attractions were available to schedule across ${tripDays} day(s) — the trip is wide open for free exploration.`;
  }

  if (averageHours < HOURS_PER_DAY / 2) {
    return `All ${scheduledCount} attraction(s) fit comfortably across ${tripDays} day(s), leaving plenty of free time each day.`;
  }

  return `All ${scheduledCount} attraction(s) fit within the ${tripDays}-day itinerary.`;
}

/**
 * Deterministically builds the full itinerary from Gemini-proposed
 * attractions. LOCKED ordering: (1) `rankByInterests` splits the attraction
 * list into interest-matched and unmatched partitions; (2) `clusterByArea`
 * is applied to each partition separately, so a large unmatched area group
 * can never jump ahead of interest-matched attractions; (3) the
 * concatenated, clustered result is greedily packed into `tripDays` days
 * capped at `HOURS_PER_DAY` hours/day. Zero/negative `estimatedHours` values
 * are clamped to 0.5 before packing. Attractions that overflow day/hour
 * capacity are dropped into `unplaced`, interest-mismatches first (they sort
 * last in the packing order, so they are the ones a greedy pack drops).
 * Handles under-supply (fewer attractions than days) via free-time verdict
 * phrasing rather than treating it as an error.
 */
export function buildItinerary(
  attractions: Attraction[],
  tripDays: number,
  interests: string[]
): ItineraryResult {
  const { matched, unmatched } = partitionByInterests(attractions, interests);

  const orderedMatched = clusterByArea(matched);
  const orderedUnmatched = clusterByArea(unmatched);
  const ordered = [...orderedMatched, ...orderedUnmatched];

  const { days, overflow } = packDays(ordered, tripDays);
  const verdict = summarizeVerdict(days, overflow, tripDays);

  return { days, unplaced: overflow, verdict };
}
