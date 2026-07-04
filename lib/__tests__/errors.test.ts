import { describe, expect, it } from "vitest";
import { classifyModelError } from "../errors";

function statusError(status: number, message = `status ${status}`): Error {
  return Object.assign(new Error(message), { status });
}

describe("classifyModelError", () => {
  describe("transient", () => {
    it.each([500, 502, 503])(
      "classifies a %s status error as transient",
      (status) => {
        expect(classifyModelError(statusError(status))).toBe("transient");
      },
    );

    it("classifies a fetch-style TypeError as transient", () => {
      expect(classifyModelError(new TypeError("fetch failed"))).toBe(
        "transient",
      );
    });

    it("classifies a network connection-failure TypeError as transient", () => {
      expect(
        classifyModelError(
          new TypeError("ECONNRESET: connection reset by peer"),
        ),
      ).toBe("transient");
    });
  });

  describe("rate_limited", () => {
    it("classifies a 429 status error as rate_limited", () => {
      expect(classifyModelError(statusError(429))).toBe("rate_limited");
    });
  });

  describe("aborted", () => {
    it("classifies an AbortError (by name) as aborted", () => {
      const err = new Error("The operation was aborted.");
      err.name = "AbortError";
      expect(classifyModelError(err)).toBe("aborted");
    });

    it("classifies a DOMException AbortError as aborted", () => {
      const err = new DOMException("The operation was aborted.", "AbortError");
      expect(classifyModelError(err)).toBe("aborted");
    });
  });

  describe("fatal", () => {
    it.each([400, 401, 403])(
      "classifies a %s status error as fatal",
      (status) => {
        expect(classifyModelError(statusError(status))).toBe("fatal");
      },
    );

    it("classifies a plain Error with no status as fatal", () => {
      expect(classifyModelError(new Error("weird"))).toBe("fatal");
    });

    it("classifies a non-Error string value as fatal", () => {
      expect(classifyModelError("just a string")).toBe("fatal");
    });

    it("classifies undefined as fatal", () => {
      expect(classifyModelError(undefined)).toBe("fatal");
    });
  });
});
