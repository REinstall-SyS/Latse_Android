import { describe, expect, it } from "vitest";
import { point, trackWith } from "./helpers/tracks";
import {
  formatGhostPace,
  formatTrailTime,
  ghostArrivalSeconds,
  locateOnTrail,
} from "../trail-navigation";
import { calculateTurnaroundPlan } from "../turnaround";

describe("live ghost navigation", () => {
  it("projects onto sparse segments instead of declaring an on-trail midpoint off route", () => {
    const result = locateOnTrail(0, 0.005, [point(0), point(1)]);
    expect(result.offTrackMeters).toBeLessThan(0.001);
    expect(result.distanceKm).toBeCloseTo(0.5);
  });
  it("uses previous progress to distinguish overlapping return legs", () => {
    const points = [point(0), point(1), { ...point(2), lng: 0 }];
    expect(locateOnTrail(0, 0.005, points, 1.6).distanceKm).toBeCloseTo(1.5);
    expect(locateOnTrail(0, 0.005, points, 0.4).distanceKm).toBeCloseTo(0.5);
  });
  it("formats ghost time and minute rollover consistently", () => {
    expect(
      ghostArrivalSeconds(0.5, trackWith([point(0, 0), point(1, 120)])),
    ).toBeCloseTo(60);
    expect(formatGhostPace(-220)).toBe("3m 40s AHEAD OF GHOST PACE");
    expect(formatGhostPace(130)).toBe("2m 10s BEHIND GHOST PACE");
    expect(formatTrailTime(3599)).toBe("1h 00m");
  });
});
describe("daylight turnaround budget", () => {
  it("reserves return time and a buffer and reports a passed deadline", () => {
    expect(calculateTurnaroundPlan(0, 240, 90, 30)).toMatchObject({
      latestTurnaroundMs: 120 * 60000,
      minutesAvailableOutbound: 120,
      returnBeforeDark: true,
    });
    expect(calculateTurnaroundPlan(0, 60, 90, 30)).toMatchObject({
      minutesAvailableOutbound: 0,
      returnBeforeDark: false,
    });
  });
});
