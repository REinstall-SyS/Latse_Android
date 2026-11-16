import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildQuickRoute,
  resolveStopElevations,
  trackFromRoutePoints,
} from "../route-builder";
import { parseGPX, serializeGPX } from "../gpx-engine";
import { TestDOMParser } from "./helpers/xml-parser";

beforeAll(() => vi.stubGlobal("DOMParser", TestDOMParser));
afterAll(() => vi.unstubAllGlobals());

describe("quick route planning", () => {
  it("builds a three-stop plan with real distances, estimated heights, and no invented timestamps", () => {
    const track = buildQuickRoute(
      [
        { lat: 0, lng: 0, ele: 100 },
        { lat: 0, lng: 0.01, ele: 200 },
        { lat: 0.01, lng: 0.01, ele: 150 },
      ],
      "Ridge & creek <plan>",
    );
    expect(track.name).toBe("Ridge & creek <plan>");
    expect(track.source).toBe("planned");
    expect(track.elevationEstimated).toBe(true);
    expect(track.stats.totalDistKm).toBeCloseTo(2.223898533, 7);
    expect(track.stats.elevationGainM).toBeCloseTo(100, 8);
    expect(track.stats.elevationLossM).toBeCloseTo(50, 8);
    expect(track.stats.durationSec).toBeNull();
    expect(track.points.every((point) => point.time === undefined)).toBe(true);
    expect(parseGPX(serializeGPX(track)).stats.totalDistKm).toBeCloseTo(
      track.stats.totalDistKm,
      8,
    );
    expect(parseGPX(serializeGPX(track))).toMatchObject({
      source: "planned",
      elevationEstimated: true,
    });
  });

  it("interpolates missing heights by traveled distance, uses known endpoints, and leaves unknown terrain flat", () => {
    const stop = (lng: number, ele: number | null) => ({ lat: 0, lng, ele });
    expect(
      resolveStopElevations([stop(0, 100), stop(0.01, null), stop(0.03, 400)]),
    ).toEqual([100, 200, 400]);
    expect(
      resolveStopElevations([stop(0, null), stop(0.01, 80), stop(0.02, null)]),
    ).toEqual([80, 80, 80]);
    expect(
      resolveStopElevations([
        stop(0, null),
        stop(0.01, null),
        stop(0.02, null),
      ]),
    ).toEqual([0, 0, 0]);
  });

  it("follows the short longitude arc across the date line", () => {
    const track = buildQuickRoute([
      { lat: 0, lng: 179.99, ele: 0 },
      { lat: 0, lng: -179.99, ele: 30 },
      { lat: 0.01, lng: -179.99, ele: 20 },
    ]);
    expect(track.stats.totalDistKm).toBeLessThan(4);
    expect(track.points.every((point) => Math.abs(point.lng) > 179)).toBe(true);
  });

  it("supports an out-and-back without duplicate segment junction points", () => {
    const track = buildQuickRoute([
      { lat: 1, lng: 1, ele: 100 },
      { lat: 1.01, lng: 1, ele: 150 },
      { lat: 1, lng: 1, ele: 100 },
    ]);
    expect(track.points[0].lat).toBe(track.points[track.points.length - 1].lat);
    expect(track.points.filter((point) => point.lat === 1.01)).toHaveLength(1);
  });

  it("rejects too few/many stops, zero-length plans, and corrupt heights", () => {
    const stop = { lat: 0, lng: 0, ele: 0 };
    expect(() => buildQuickRoute([stop, stop])).toThrow("3–10");
    expect(() => buildQuickRoute(Array(11).fill(stop))).toThrow("3–10");
    expect(() => buildQuickRoute([stop, stop, stop])).toThrow("10 m");
    expect(() =>
      buildQuickRoute([stop, { ...stop, ele: Infinity }, stop]),
    ).toThrow("valid");
    expect(() =>
      trackFromRoutePoints([{ ...stop, ele: 1e308 }, stop], "Bad"),
    ).toThrow("invalid");
    expect(() =>
      trackFromRoutePoints([stop, { ...stop, time: 1e20 }], "Bad"),
    ).toThrow("invalid");
  });
});
