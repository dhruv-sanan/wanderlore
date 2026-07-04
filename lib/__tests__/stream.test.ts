import { describe, expect, it } from "vitest";
import { encodeEvent } from "../stream";
import type { TraceEvent } from "../types";

function baseEvent(overrides: Partial<TraceEvent> = {}): TraceEvent {
  return {
    type: "trace",
    stage: "received",
    message: "Request received.",
    timestamp: 1234567890,
    ...overrides,
  };
}

describe("encodeEvent", () => {
  it("decodes to a single line terminated by a newline", () => {
    const bytes = encodeEvent(baseEvent());
    const text = new TextDecoder().decode(bytes);
    expect(text.endsWith("\n")).toBe(true);
    const lines = text.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(1);
  });

  it("round-trips through JSON.parse", () => {
    const event = baseEvent({ stage: "computed", message: "Computed plan." });
    const bytes = encodeEvent(event);
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text.trimEnd());
    expect(parsed).toEqual(event);
  });

  it("does not produce multi-line output for a message containing a newline", () => {
    const event = baseEvent({ message: "Line one\nLine two" });
    const bytes = encodeEvent(event);
    const text = new TextDecoder().decode(bytes);
    const nonEmptyLines = text.split("\n").filter((l) => l.length > 0);
    expect(nonEmptyLines.length).toBe(1);
    const parsed = JSON.parse(text.trimEnd());
    expect(parsed.message).toBe("Line one\nLine two");
  });
});
