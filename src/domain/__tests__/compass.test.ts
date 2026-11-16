import { describe, expect, it } from "vitest";
import { normalizeCompassHeading } from "../compass";
describe("finite magnetic compass headings", () => {
  it.each([
    [360, 0],
    [0, 0],
    [359.6, 0],
    [-1, 359],
    [721, 1],
    [12.4, 12],
  ])("normalizes %s to %s degrees", (raw, expected) =>
    expect(normalizeCompassHeading(raw)).toBe(expected),
  );
  it("keeps unavailable sensor values unavailable", () => {
    expect(normalizeCompassHeading(NaN)).toBeNull();
    expect(normalizeCompassHeading(Infinity)).toBeNull();
  });
});
