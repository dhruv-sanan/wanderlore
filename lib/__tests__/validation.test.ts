import { describe, expect, it } from "vitest";
import { sanitizeText, validateDiscoveryRequest } from "../validation";
import { INTEREST_OPTIONS, type DiscoveryRequest } from "../types";

describe("sanitizeText", () => {
  it("trims leading and trailing whitespace", () => {
    expect(sanitizeText("  Paris  ")).toBe("Paris");
  });

  it("strips angle brackets", () => {
    expect(sanitizeText("Paris<script>")).not.toContain("<");
    expect(sanitizeText("Paris<script>")).not.toContain(">");
  });

  it("strips control characters", () => {
    const withControl = `Paris${String.fromCharCode(7)}${String.fromCharCode(1)}`;
    const result = sanitizeText(withControl);
    expect(result).not.toContain(String.fromCharCode(7));
    expect(result).not.toContain(String.fromCharCode(1));
  });

  it("caps output at 80 characters", () => {
    const long = "a".repeat(200);
    expect(sanitizeText(long).length).toBeLessThanOrEqual(80);
  });

  it("passes plain strings through unchanged (aside from trim)", () => {
    expect(sanitizeText("Kyoto, Japan")).toBe("Kyoto, Japan");
  });
});

describe("validateDiscoveryRequest", () => {
  const baseValid = {
    destination: "Kyoto",
    tripDays: 3,
    interests: ["history", "food"],
  };

  it("returns a typed object for a fully valid request", () => {
    const result = validateDiscoveryRequest(baseValid);
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      destination: "Kyoto",
      tripDays: 3,
      interests: ["history", "food"],
    });
  });

  it("rejects a null body", () => {
    expect(validateDiscoveryRequest(null)).toBeNull();
  });

  it("rejects an undefined body", () => {
    expect(validateDiscoveryRequest(undefined)).toBeNull();
  });

  it("rejects a string body", () => {
    expect(validateDiscoveryRequest("Kyoto")).toBeNull();
  });

  it("rejects an array body", () => {
    expect(validateDiscoveryRequest([baseValid])).toBeNull();
  });

  it("rejects a request missing destination", () => {
    const { destination, ...rest } = baseValid;
    expect(validateDiscoveryRequest(rest)).toBeNull();
  });

  it("rejects a destination that is a single character", () => {
    expect(
      validateDiscoveryRequest({ ...baseValid, destination: "K" }),
    ).toBeNull();
  });

  describe("destination charset allowlist", () => {
    it.each([
      "Paris; DROP TABLE",
      "{}$",
      "Paris`whoami`",
      "Rome#hashtag",
    ])("rejects charset violation: %s", (destination) => {
      expect(validateDiscoveryRequest({ ...baseValid, destination })).toBeNull();
    });

    it.each([
      "São Paulo",
      "Jaipur, Rajasthan",
      "L'Aquila",
      "St. John's",
      "Baden-Baden",
      "Washington, D.C.",
      "Dún Laoghaire",
      "Area 51",
      "Trinidad & Tobago",
    ])("accepts real place name: %s", (destination) => {
      const result = validateDiscoveryRequest({ ...baseValid, destination });
      expect(result).not.toBeNull();
      expect(result?.destination).toBe(destination);
    });
  });

  describe("tripDays range", () => {
    it.each([0, 8, 2.5, NaN])("rejects invalid tripDays: %s", (tripDays) => {
      expect(validateDiscoveryRequest({ ...baseValid, tripDays })).toBeNull();
    });

    it.each([1, 7])("accepts boundary tripDays: %s", (tripDays) => {
      expect(validateDiscoveryRequest({ ...baseValid, tripDays })).not.toBeNull();
    });
  });

  describe("interests whitelist", () => {
    it("rejects an interest outside INTEREST_OPTIONS", () => {
      expect(
        validateDiscoveryRequest({
          ...baseValid,
          interests: ["skiing"],
        }),
      ).toBeNull();
    });

    it("rejects more than 6 interests", () => {
      const sevenInterests = [...INTEREST_OPTIONS, "history"];
      expect(
        validateDiscoveryRequest({ ...baseValid, interests: sevenInterests }),
      ).toBeNull();
    });

    it("accepts an empty interests array as valid", () => {
      const result: DiscoveryRequest | null = validateDiscoveryRequest({
        ...baseValid,
        interests: [],
      });
      expect(result).not.toBeNull();
      expect(result?.interests).toEqual([]);
    });

    it("accepts all six interest options at once", () => {
      const result = validateDiscoveryRequest({
        ...baseValid,
        interests: [...INTEREST_OPTIONS],
      });
      expect(result).not.toBeNull();
    });
  });
});
