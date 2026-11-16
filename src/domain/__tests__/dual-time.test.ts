import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  calculateGhostDelta,
  interpolateTrackByTime,
  parseGPX,
  serializeGPX,
} from "../gpx-engine";
import { point, START_MS, trackWith } from "./helpers/tracks";
import { TestDOMParser } from "./helpers/xml-parser";
import { prepareArtifactTrack } from "@/services/artifact-track";
import {
  encodeLatseRoute,
  parseTrailInput,
} from "@/services/route-import.service";

beforeAll(() => vi.stubGlobal("DOMParser", TestDOMParser));
afterAll(() => vi.unstubAllGlobals());

describe("moving and capture timelines", () => {
  const points = [
    { ...point(0, 0), wallTime: START_MS },
    { ...point(1, 60), wallTime: START_MS + 660000 },
    { ...point(2, 120), wallTime: START_MS + 720000 },
    { ...point(3, 180), wallTime: START_MS + 780000 },
  ];
  it("uses real capture time after a pause while ghost pacing keeps moving time", () => {
    expect(interpolateTrackByTime(START_MS + 650000, points)).toBe(points[1]);
    expect(calculateGhostDelta(0.5, 30, trackWith(points)).deltaSec).toBe(0);
    expect(
      interpolateTrackByTime(
        START_MS + 650000,
        points.map(({ wallTime, ...point }) => point),
      ),
    ).toBeNull();
  });
  it("round trips both timelines through GPX and a shared route code", () => {
    const track = trackWith(points);
    expect(
      parseGPX(serializeGPX(track)).points.map((point) => point.wallTime),
    ).toEqual(points.map((point) => point.wallTime));
    expect(
      parseTrailInput(encodeLatseRoute(track)).points.map(
        (point) => point.wallTime,
      ),
    ).toEqual(points.map((point) => point.wallTime));
  });
  it("removes capture times as well as moving times from privacy exports", () => {
    const privateTrack = prepareArtifactTrack(trackWith(points), 500);
    expect(
      privateTrack.points.every(
        (point) => point.time === undefined && point.wallTime === undefined,
      ),
    ).toBe(true);
    expect(serializeGPX(trackWith(points), 500)).not.toContain("wallTime");
  });
});
