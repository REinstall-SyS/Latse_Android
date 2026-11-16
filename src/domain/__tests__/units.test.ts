import { describe, it, expect } from "vitest";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatVertRate,
  defaultUnits,
} from "../units";
describe("hiker unit preferences", () => {
  it("converts canonical route distances without changing stored geometry", () => {
    expect(formatDistance(23.8, "imperial")).toBe("14.8 mi");
    expect(formatDistance(23.8, "metric")).toBe("23.8 km");
  });
  it("formats signed elevations and vertical rates", () => {
    expect(formatElevation(1460, "imperial", true)).toBe("+4,790 ft");
    expect(formatElevation(1460, "metric", true)).toBe("+1,460 m");
    expect(formatElevation(-100, "imperial")).toBe("-328 ft");
    expect(formatVertRate(564, "imperial")).toBe("1,850 ft/h");
    expect(formatVertRate(564, "metric")).toBe("564 m/h");
  });
  it("converts pace seconds with carry and preserves missing timing", () => {
    expect(formatPace("10:00 /km", "imperial")).toBe("16:06 /mi");
    expect(formatPace("6:00 /km", "metric")).toBe("6:00 /km");
    expect(formatPace("— /km", "imperial")).toBe("— /mi");
    expect(formatPace("1:59 /km", "imperial")).toBe("3:12 /mi");
  });
  it("defaults US English to imperial", () => {
    expect(defaultUnits("en-US")).toBe("imperial");
    expect(defaultUnits("en-GB")).toBe("metric");
  });
});
