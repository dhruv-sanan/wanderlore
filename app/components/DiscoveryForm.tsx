"use client";

import { memo, useCallback, useId, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { INTEREST_OPTIONS, type DiscoveryRequest, type Interest } from "@/lib/types";

/** Props for {@link DiscoveryForm}. */
export interface DiscoveryFormProps {
  /** Called with a fully-formed, client-validated request when the traveler submits the form. */
  onSubmit: (request: DiscoveryRequest) => void;
  /** True while a discovery request is in flight; disables the submit button. */
  isRunning: boolean;
}

/** Capitalizes an interest slug for display, e.g. "history" -> "History". */
function labelFor(interest: Interest): string {
  return interest.charAt(0).toUpperCase() + interest.slice(1);
}

/** Props for {@link InterestChecklist}. */
interface InterestChecklistProps {
  /** Interests currently selected by the traveler. */
  selected: Interest[];
  /** Toggles one interest in or out of the selection. */
  onToggle: (interest: Interest) => void;
  /** Id of the fieldset legend, used to derive stable per-checkbox input ids. */
  legendId: string;
}

/** Renders the interest checkboxes for every {@link INTEREST_OPTIONS} entry. */
function InterestChecklistComponent({
  selected,
  onToggle,
  legendId,
}: InterestChecklistProps): ReactElement {
  return (
    <div className="flex flex-wrap gap-3">
      {INTEREST_OPTIONS.map((interest) => {
        const inputId = `${legendId}-${interest}`;
        return (
          <label
            key={interest}
            htmlFor={inputId}
            className="flex min-h-11 items-center gap-2 rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800"
          >
            <input
              id={inputId}
              type="checkbox"
              checked={selected.includes(interest)}
              onChange={() => onToggle(interest)}
              className="h-5 w-5 accent-amber-800"
            />
            {labelFor(interest)}
          </label>
        );
      })}
    </div>
  );
}

/** Memoized checklist — typing in the destination field never re-renders it. */
const InterestChecklist = memo(InterestChecklistComponent);

/**
 * The trip request control panel: destination, trip length (1-7 days), and
 * optional interest checkboxes. Performs client-side pre-validation that
 * mirrors the server's accepted ranges, but never treats itself as the
 * authority — the backend still validates. Field values are never cleared on
 * failure, so recovering from a transient error is a single click on Submit.
 */
function DiscoveryFormComponent({ onSubmit, isRunning }: DiscoveryFormProps): ReactElement {
  const [destination, setDestination] = useState("");
  const [tripDays, setTripDays] = useState(3);
  const [interests, setInterests] = useState<Interest[]>([]);
  const destinationId = useId();
  const tripDaysId = useId();
  const legendId = useId();

  const toggleInterest = useCallback((interest: Interest) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((item) => item !== interest) : [...prev, interest],
    );
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) {
        return;
      }
      const trimmedDestination = destination.trim();
      if (trimmedDestination.length < 1 || trimmedDestination.length > 80) {
        return;
      }
      if (!Number.isInteger(tripDays) || tripDays < 1 || tripDays > 7) {
        return;
      }
      onSubmit({
        destination: trimmedDestination,
        tripDays,
        interests,
      });
    },
    [destination, tripDays, interests, onSubmit],
  );

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Trip discovery form"
      className="flex flex-col gap-5 rounded-xl border border-stone-300 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={destinationId} className="text-sm font-semibold text-stone-800">
          Destination
        </label>
        <input
          id={destinationId}
          name="destination"
          type="text"
          required
          maxLength={80}
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          placeholder="e.g. Kyoto, Japan"
          className="min-h-11 rounded-md border border-stone-400 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={tripDaysId} className="text-sm font-semibold text-stone-800">
          Trip length (1&ndash;7 days)
        </label>
        <input
          id={tripDaysId}
          name="tripDays"
          type="number"
          required
          min={1}
          max={7}
          step={1}
          value={Number.isNaN(tripDays) ? "" : tripDays}
          onChange={(event) => setTripDays(event.target.valueAsNumber)}
          className="min-h-11 w-28 rounded-md border border-stone-400 bg-white px-3 py-2 text-base text-stone-900"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend id={legendId} className="text-sm font-semibold text-stone-800">
          Interests (optional)
        </legend>
        <InterestChecklist selected={interests} onToggle={toggleInterest} legendId={legendId} />
      </fieldset>

      <button
        type="submit"
        disabled={isRunning}
        className="min-h-11 rounded-md bg-amber-800 px-5 py-2 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-400"
      >
        {isRunning ? "Discovering…" : "Discover"}
      </button>
    </form>
  );
}

/**
 * Memoized trip discovery form. See {@link DiscoveryFormComponent} for behavior.
 */
export const DiscoveryForm = memo(DiscoveryFormComponent);
