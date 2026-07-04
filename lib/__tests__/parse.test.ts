import { describe, expect, it } from "vitest";
import { parseGeminiPayload } from "../parse";
import type {
  Attraction,
  CulturalEvent,
  GeminiTravelPayload,
  HiddenGem,
} from "../types";

function attraction(overrides: Partial<Attraction> = {}): Attraction {
  return {
    name: "Old Fort",
    description: "A centuries-old fort.",
    category: "history",
    area: "Old Town",
    estimatedHours: 2,
    whyVisit: "Foundational to local history.",
    ...overrides,
  };
}

function gem(overrides: Partial<HiddenGem> = {}): HiddenGem {
  return {
    name: "Hidden Courtyard",
    description: "A quiet courtyard tucked away.",
    localTip: "Visit at sunrise.",
    ...overrides,
  };
}

function event(overrides: Partial<CulturalEvent> = {}): CulturalEvent {
  return {
    name: "Lantern Festival",
    description: "A city-wide lantern celebration.",
    bestTime: "October evenings",
    ...overrides,
  };
}

function validPayload(): GeminiTravelPayload {
  return {
    attractions: [attraction()],
    hiddenGems: [gem()],
    events: [event()],
    story: {
      title: "Echoes of the Old Town",
      narrative: "Long ago, traders filled these streets.",
    },
  };
}

describe("parseGeminiPayload", () => {
  it("parses a valid full payload matching the input", () => {
    const payload = validPayload();
    const result = parseGeminiPayload(JSON.stringify(payload));
    expect(result).toEqual(payload);
  });

  it("returns null when story is missing", () => {
    const payload = validPayload();
    const { story, ...rest } = payload;
    expect(parseGeminiPayload(JSON.stringify(rest))).toBeNull();
  });

  it("returns null when attractions is not an array", () => {
    const payload = { ...validPayload(), attractions: "not-an-array" };
    expect(parseGeminiPayload(JSON.stringify(payload))).toBeNull();
  });

  it("returns null when an attraction is missing estimatedHours", () => {
    const bad = attraction() as unknown as Record<string, unknown>;
    delete bad.estimatedHours;
    const payload = { ...validPayload(), attractions: [bad] };
    expect(parseGeminiPayload(JSON.stringify(payload))).toBeNull();
  });

  it("returns null when an attraction is missing area", () => {
    const bad = attraction() as unknown as Record<string, unknown>;
    delete bad.area;
    const payload = { ...validPayload(), attractions: [bad] };
    expect(parseGeminiPayload(JSON.stringify(payload))).toBeNull();
  });

  it("returns null when estimatedHours is a string instead of a number", () => {
    const payload = {
      ...validPayload(),
      attractions: [attraction({ estimatedHours: "3" as unknown as number })],
    };
    expect(parseGeminiPayload(JSON.stringify(payload))).toBeNull();
  });

  it("returns null for invalid JSON text", () => {
    expect(parseGeminiPayload("{not valid json")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseGeminiPayload("")).toBeNull();
  });

  describe("cap enforcement (defense against provider schema slippage)", () => {
    it("returns null when attractions exceed 14 items", () => {
      const payload = {
        ...validPayload(),
        attractions: Array.from({ length: 15 }, (_, i) =>
          attraction({ name: `Stop${i}` }),
        ),
      };
      expect(parseGeminiPayload(JSON.stringify(payload))).toBeNull();
    });

    it("returns null when hiddenGems exceed 4 items", () => {
      const payload = {
        ...validPayload(),
        hiddenGems: Array.from({ length: 5 }, (_, i) =>
          gem({ name: `Gem${i}` }),
        ),
      };
      expect(parseGeminiPayload(JSON.stringify(payload))).toBeNull();
    });

    it("returns null when events exceed 4 items", () => {
      const payload = {
        ...validPayload(),
        events: Array.from({ length: 5 }, (_, i) =>
          event({ name: `Event${i}` }),
        ),
      };
      expect(parseGeminiPayload(JSON.stringify(payload))).toBeNull();
    });
  });
});
