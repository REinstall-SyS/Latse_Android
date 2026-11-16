import { describe, expect, it } from "vitest";
import {
  calculateDaylightRemaining,
  calculatePaceMinPerKm,
  calculateVerticalRate,
} from "../altitude-physics";
import { suggestEmergencyContact } from "@/data/emergency.data";

describe("universal trail effort", () => {
  it("calculates ascent per active hour and formats pace with rollover", () => {
    expect(calculateVerticalRate(640, 7200)).toBe(320);
    expect(calculatePaceMinPerKm(5, 3420)).toBe("11:24 /km");
    expect(calculatePaceMinPerKm(1, 659.8)).toBe("11:00 /km");
  });

  it.each([0, -1, NaN, Infinity])(
    "handles unusable duration %s",
    (duration) => {
      expect(calculateVerticalRate(100, duration)).toBe(0);
      expect(calculatePaceMinPerKm(10, duration)).toBe("— /km");
    },
  );

  it("does not invent distance or positive gain", () => {
    expect(calculatePaceMinPerKm(0, 100)).toBe("— /km");
    expect(calculateVerticalRate(-100, 100)).toBe(0);
  });
});

describe("offline solar geometry", () => {
  it("places the equatorial equinox sunset near 18:10 UTC", () => {
    const result = calculateDaylightRemaining(0, 0, Date.UTC(2026, 2, 20, 12));
    expect(result.isAfterSunset).toBe(false);
    expect(result.daylightRemainingMin).toBeGreaterThan(360);
    expect(result.daylightRemainingMin).toBeLessThan(380);
    expect(result.sunsetTimeStr).toMatch(/^18:[01]\d UTC$/);
  });

  it("handles a western summer sunset on the following UTC date", () => {
    const result = calculateDaylightRemaining(
      40.71,
      -74,
      Date.UTC(2026, 5, 21, 16),
    );
    expect(result.sunsetTimeStr).toMatch(/^00:[234]\d UTC$/);
    expect(result.daylightRemainingMin).toBeGreaterThan(480);
    expect(result.daylightRemainingMin).toBeLessThan(540);
  });

  it("reports no daylight after sunset and before sunrise", () => {
    expect(
      calculateDaylightRemaining(0, 0, Date.UTC(2026, 2, 20, 22)),
    ).toMatchObject({ daylightRemainingMin: 0, isAfterSunset: true });
    expect(
      calculateDaylightRemaining(0, 0, Date.UTC(2026, 2, 20, 3)),
    ).toMatchObject({ daylightRemainingMin: 0, isAfterSunset: true });
  });

  it("handles polar day, polar night, leap day, and the date line without NaN", () => {
    expect(
      calculateDaylightRemaining(90, 0, Date.UTC(2026, 5, 21, 12)),
    ).toMatchObject({ daylightRemainingMin: 1440, isAfterSunset: false });
    expect(
      calculateDaylightRemaining(90, 0, Date.UTC(2026, 11, 21, 12)),
    ).toMatchObject({ daylightRemainingMin: 0, isAfterSunset: true });
    for (const lng of [-179.9, 179.9]) {
      const result = calculateDaylightRemaining(
        -30,
        lng,
        Date.UTC(2024, 1, 29, 0),
      );
      expect(Number.isFinite(result.daylightRemainingMin)).toBe(true);
      expect(result.daylightRemainingMin).toBeGreaterThanOrEqual(0);
      expect(result.daylightRemainingMin).toBeLessThan(1440);
    }
  });

  it.each([
    [91, 0, 0],
    [0, 181, 0],
    [NaN, 0, 0],
    [0, 0, NaN],
  ])("rejects invalid coordinates/time", (lat, lng, time) => {
    expect(() => calculateDaylightRemaining(lat, lng, time)).toThrow(
      RangeError,
    );
  });
});

describe("offline emergency region suggestions", () => {
  it.each([
    [30.74, -89.08, "911"],
    [45.89, 6.798, "112"],
    [51.51, -0.13, "999"],
    [54.6, -5.93, "999"],
    [50.95, 1.86, "112"],
    [-33.86, 151.2, "000"],
  ])("suggests a dial shortcut for %s, %s", (lat, lng, number) => {
    expect(suggestEmergencyContact(lat as number, lng as number).number).toBe(
      number,
    );
  });
});
