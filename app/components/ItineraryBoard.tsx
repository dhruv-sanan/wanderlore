import { memo } from "react";
import type { Attraction, ItineraryResult } from "@/lib/types";

/** Props for {@link ItineraryBoard}. */
export interface ItineraryBoardProps {
  /** The deterministically packed itinerary to render. */
  itinerary: ItineraryResult;
}

/** Daily hour cap used purely for the on-screen "X h / 8h cap" label. */
const DAY_HOUR_CAP = 8;

/** Renders one attraction's name, hours, category, neighborhood tag, and rationale. */
function AttractionItem({ attraction }: { attraction: Attraction }) {
  return (
    <li className="rounded-md border border-stone-300 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-stone-900">{attraction.name}</span>
        <span className="text-sm text-stone-600">{attraction.estimatedHours}h</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
          {attraction.category}
        </span>
        <span className="rounded-full bg-teal-100 px-2 py-0.5 font-medium text-teal-900">
          {attraction.area}
        </span>
      </div>
      <p className="mt-2 text-sm text-stone-700">{attraction.whyVisit}</p>
    </li>
  );
}

/**
 * The packed trip board: one `<section>` per itinerary day with its
 * attractions, a coverage verdict, and — when non-empty — the list of
 * attractions that did not fit. All packing is deterministic output from
 * the backend; this component only renders it.
 */
function ItineraryBoardComponent({ itinerary }: ItineraryBoardProps) {
  return (
    <section
      aria-labelledby="itinerary-heading"
      className="flex flex-col gap-4 rounded-xl border border-stone-300 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 id="itinerary-heading" className="text-xl font-bold text-stone-900">
        Your itinerary
      </h2>

      <p
        role="status"
        className="rounded-md border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900"
      >
        {itinerary.verdict}
      </p>

      {itinerary.days.map((day) => (
        <section key={day.day} aria-labelledby={`day-${day.day}-heading`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`day-${day.day}-heading`} className="text-lg font-semibold text-stone-900">
              Day {day.day}
            </h3>
            <span className="text-sm text-stone-600">
              {day.totalHours}h / {DAY_HOUR_CAP}h cap
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {day.attractions.map((attraction) => (
              <AttractionItem key={attraction.name} attraction={attraction} />
            ))}
          </ul>
        </section>
      ))}

      {itinerary.unplaced.length > 0 && (
        <section aria-labelledby="unplaced-heading" className="flex flex-col gap-2">
          <h3 id="unplaced-heading" className="text-lg font-semibold text-stone-900">
            Didn&rsquo;t fit this trip
          </h3>
          <ul className="flex flex-col gap-2">
            {itinerary.unplaced.map((attraction) => (
              <AttractionItem key={attraction.name} attraction={attraction} />
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

/**
 * Memoized itinerary board. See {@link ItineraryBoardComponent} for behavior.
 */
export const ItineraryBoard = memo(ItineraryBoardComponent);
