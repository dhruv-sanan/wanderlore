import { describe, expect, it } from "vitest";
import {
  HOURS_PER_DAY,
  buildItinerary,
  clusterByArea,
  normalizeArea,
  rankByInterests,
  summarizeVerdict,
} from "../itinerary";
import type { Attraction, ItineraryDay } from "../types";

function attraction(overrides: Partial<Attraction> = {}): Attraction {
  return {
    name: "Attraction",
    description: "A short description.",
    category: "general",
    area: "Downtown",
    estimatedHours: 2,
    whyVisit: "Because it matters.",
    ...overrides,
  };
}

function names(list: Attraction[]): string[] {
  return list.map((a) => a.name);
}

describe("rankByInterests", () => {
  it("moves matching categories to the front", () => {
    const list = [
      attraction({ name: "A1", category: "general" }),
      attraction({ name: "A2", category: "history" }),
      attraction({ name: "A3", category: "food" }),
      attraction({ name: "A4", category: "general" }),
      attraction({ name: "A5", category: "history" }),
    ];
    const ranked = rankByInterests(list, ["history"]);
    expect(names(ranked)).toEqual(["A2", "A5", "A1", "A3", "A4"]);
  });

  it("preserves relative order stably within matched and unmatched groups", () => {
    const list = [
      attraction({ name: "M1", category: "art" }),
      attraction({ name: "U1", category: "general" }),
      attraction({ name: "M2", category: "nature" }),
      attraction({ name: "U2", category: "food" }),
      attraction({ name: "M3", category: "art" }),
    ];
    const ranked = rankByInterests(list, ["art", "nature"]);
    expect(names(ranked)).toEqual(["M1", "M2", "M3", "U1", "U2"]);
  });

  it("leaves order unchanged when no interests are given", () => {
    const list = [
      attraction({ name: "A", category: "history" }),
      attraction({ name: "B", category: "general" }),
      attraction({ name: "C", category: "food" }),
    ];
    expect(names(rankByInterests(list, []))).toEqual(["A", "B", "C"]);
  });

  it("never treats category 'general' as a match, even if 'general' is passed as an interest", () => {
    const list = [
      attraction({ name: "G1", category: "general" }),
      attraction({ name: "H1", category: "history" }),
    ];
    const ranked = rankByInterests(list, ["general"]);
    expect(names(ranked)).toEqual(["G1", "H1"]);
  });
});

describe("normalizeArea", () => {
  it("treats case drift as equivalent", () => {
    expect(normalizeArea("Old City")).toBe(normalizeArea("old city"));
  });

  it("collapses spacing and punctuation drift", () => {
    expect(normalizeArea("old  town.")).toBe("old town");
  });

  it("maps blank or whitespace-only input to the empty-string sentinel", () => {
    expect(normalizeArea("")).toBe("");
    expect(normalizeArea("   ")).toBe("");
  });
});

describe("clusterByArea", () => {
  it("brings noisy variants of the same area (Old City / old city) adjacent", () => {
    const x = attraction({ name: "x", area: "Downtown" });
    const y = attraction({ name: "y", area: "Old City" });
    const z = attraction({ name: "z", area: "Uptown" });
    const w = attraction({ name: "w", area: "old city" });
    const clustered = clusterByArea([x, y, z, w]);
    const yIdx = clustered.findIndex((a) => a.name === "y");
    const wIdx = clustered.findIndex((a) => a.name === "w");
    expect(Math.abs(yIdx - wIdx)).toBe(1);
  });

  it("orders area blocks by first appearance", () => {
    const a = attraction({ name: "a", area: "X" });
    const b = attraction({ name: "b", area: "Y" });
    const c = attraction({ name: "c", area: "X" });
    const d = attraction({ name: "d", area: "Y" });
    const clustered = clusterByArea([a, b, c, d]);
    expect(names(clustered)).toEqual(["a", "c", "b", "d"]);
  });

  it("leaves order unchanged when every area is distinct", () => {
    const a = attraction({ name: "a", area: "A" });
    const b = attraction({ name: "b", area: "B" });
    const c = attraction({ name: "c", area: "C" });
    expect(names(clusterByArea([a, b, c]))).toEqual(["a", "b", "c"]);
  });

  it("never clusters two blank-area items together", () => {
    const a = attraction({ name: "a", area: "" });
    const b = attraction({ name: "b", area: "X" });
    const c = attraction({ name: "c", area: "" });
    expect(names(clusterByArea([a, b, c]))).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for empty input", () => {
    expect(clusterByArea([])).toEqual([]);
  });
});

describe("buildItinerary", () => {
  it("places everything with empty unplaced when it all fits within capacity", () => {
    const list = [
      attraction({ name: "A", estimatedHours: 2 }),
      attraction({ name: "B", estimatedHours: 2 }),
      attraction({ name: "C", estimatedHours: 2 }),
    ];
    const result = buildItinerary(list, 3, []);
    expect(result.unplaced).toEqual([]);
    for (const day of result.days) {
      expect(day.totalHours).toBeLessThanOrEqual(HOURS_PER_DAY);
    }
  });

  it("drops interest-mismatched attractions first on overflow", () => {
    const list = [
      attraction({ name: "Match", category: "history", estimatedHours: 6 }),
      attraction({ name: "Un1", category: "general", estimatedHours: 4 }),
      attraction({ name: "Un2", category: "general", estimatedHours: 4 }),
    ];
    const result = buildItinerary(list, 1, ["history"]);
    const placedNames = result.days.flatMap((d) => names(d.attractions));
    expect(placedNames).toContain("Match");
    expect(names(result.unplaced).sort()).toEqual(["Un1", "Un2"]);
  });

  it("never lets a large same-area unmatched group displace an interest match", () => {
    const list = [
      attraction({
        name: "BigArea1",
        category: "general",
        area: "BigArea",
        estimatedHours: 3,
      }),
      attraction({
        name: "BigArea2",
        category: "general",
        area: "BigArea",
        estimatedHours: 3,
      }),
      attraction({
        name: "BigArea3",
        category: "general",
        area: "BigArea",
        estimatedHours: 3,
      }),
      attraction({
        name: "Match",
        category: "food",
        area: "Elsewhere",
        estimatedHours: 2,
      }),
    ];
    const result = buildItinerary(list, 1, ["food"]);
    const unplacedNames = names(result.unplaced);
    expect(unplacedNames).not.toContain("Match");
    expect(unplacedNames.length).toBeGreaterThan(0);
    expect(unplacedNames.every((n) => n.startsWith("BigArea"))).toBe(true);
  });

  it("keeps same-area attractions on the same day when hours allow", () => {
    const list = [
      attraction({ name: "A", area: "Zone", estimatedHours: 2 }),
      attraction({ name: "B", area: "Zone", estimatedHours: 2 }),
      attraction({ name: "C", area: "Other", estimatedHours: 2 }),
    ];
    const result = buildItinerary(list, 2, []);
    const dayOf = (n: string) =>
      result.days.find((d) => names(d.attractions).includes(n))?.day;
    expect(dayOf("A")).toBe(dayOf("B"));
  });

  it("fills every one of 7 days for a realistic 14-attraction, 2-4h fixture", () => {
    const hoursPattern = [2, 3, 4, 2, 3, 4, 2, 3, 4, 2, 3, 4, 2, 3];
    const list = hoursPattern.map((h, i) =>
      attraction({
        name: `Stop${i + 1}`,
        area: `Area${i % 5}`,
        estimatedHours: h,
      }),
    );
    const result = buildItinerary(list, 7, []);
    expect(result.days.length).toBe(7);
    for (const day of result.days) {
      expect(day.attractions.length).toBeGreaterThan(0);
    }
  });

  it("returns a valid free-time result (not an error) for empty attractions", () => {
    expect(() => buildItinerary([], 3, [])).not.toThrow();
    const result = buildItinerary([], 3, []);
    expect(result.unplaced).toEqual([]);
    expect(result.verdict.length).toBeGreaterThan(0);
  });

  it("handles a 1-day trip", () => {
    const list = [attraction({ name: "Solo", estimatedHours: 5 })];
    const result = buildItinerary(list, 1, []);
    expect(result.days.length).toBe(1);
    expect(names(result.days[0].attractions)).toContain("Solo");
  });

  it("lets a single attraction with hours exactly at the day cap fill a day alone", () => {
    const list = [
      attraction({ name: "FullDay", estimatedHours: HOURS_PER_DAY }),
      attraction({ name: "Other", estimatedHours: 1 }),
    ];
    const result = buildItinerary(list, 2, []);
    const fullDay = result.days.find((d) =>
      names(d.attractions).includes("FullDay"),
    );
    expect(fullDay?.attractions.length).toBe(1);
    expect(fullDay?.totalHours).toBe(HOURS_PER_DAY);
  });

  it("clamps zero and negative estimatedHours to 0.5", () => {
    const list = [
      attraction({ name: "Zero", estimatedHours: 0 }),
      attraction({ name: "Neg", estimatedHours: -5 }),
    ];
    const result = buildItinerary(list, 1, []);
    expect(result.unplaced).toEqual([]);
    const totalHours = result.days.reduce((sum, d) => sum + d.totalHours, 0);
    expect(totalHours).toBe(1);
  });

  it("is deterministic: identical input produces a deep-equal result", () => {
    const build = () => [
      attraction({ name: "A", area: "Zone", estimatedHours: 3 }),
      attraction({ name: "B", area: "Zone", estimatedHours: 2 }),
      attraction({ name: "C", area: "Other", estimatedHours: 4 }),
    ];
    const first = buildItinerary(build(), 2, ["history"]);
    const second = buildItinerary(build(), 2, ["history"]);
    expect(first).toEqual(second);
  });
});

describe("summarizeVerdict", () => {
  it("describes full coverage without mentioning unplaced attractions", () => {
    const days: ItineraryDay[] = [
      { day: 1, attractions: [attraction({ name: "A" })], totalHours: 2 },
    ];
    const verdict = summarizeVerdict(days, [], 1);
    expect(verdict.length).toBeGreaterThan(0);
    expect(verdict.toLowerCase()).not.toContain("unplaced");
  });

  it("names unplaced attractions in the overflow wording", () => {
    const days: ItineraryDay[] = [
      { day: 1, attractions: [attraction({ name: "A" })], totalHours: 2 },
    ];
    const unplaced = [
      attraction({ name: "Leftover One" }),
      attraction({ name: "Leftover Two" }),
    ];
    const verdict = summarizeVerdict(days, unplaced, 1);
    expect(verdict).toContain("Leftover One");
    expect(verdict).toContain("Leftover Two");
  });

  it("produces a non-empty light-schedule verdict for an empty itinerary", () => {
    const days: ItineraryDay[] = [{ day: 1, attractions: [], totalHours: 0 }];
    const verdict = summarizeVerdict(days, [], 1);
    expect(typeof verdict).toBe("string");
    expect(verdict.length).toBeGreaterThan(0);
  });
});
