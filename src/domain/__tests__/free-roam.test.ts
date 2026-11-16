import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { TestDOMParser } from "./helpers/xml-parser";
import { point } from "./helpers/tracks";
import { createRoam, updateRoamPath } from "../free-roam";
import { hasGPSGap } from "../geospatial";
beforeAll(() => vi.stubGlobal("DOMParser", TestDOMParser));
afterAll(() => vi.unstubAllGlobals());
it("creates a blank local roam and derives distance, gain and grade from its coordinates", () => {
  const draft = createRoam();
  expect(draft.points).toEqual([]);
  const route = updateRoamPath(draft, [
    point(0, undefined, 100),
    point(1, undefined, 150),
    point(2, undefined, 125),
  ]);
  expect(route.id).toBe(draft.id);
  expect(route.stats.totalDistKm).toBeGreaterThan(2);
  expect(route.stats.elevationGainM).toBe(50);
  expect(route.elevationEstimated).toBe(true);
  expect(route.points[1].gradePct).toBeGreaterThan(0);
});
it("retains photos and the same roam identity through trace edits", () => {
  const draft = createRoam();
  draft.pins = [
    {
      id: "off",
      lat: 2,
      lng: 3,
      ele: 0,
      cumDistKm: 0,
      timestamp: 1,
      caption: "Far lookout",
      offTrail: true,
    },
  ];
  const route = updateRoamPath(draft, [point(0), point(1)]);
  expect(route.pins[0]).toEqual(draft.pins[0]);
  expect(updateRoamPath(route, []).id).toBe(draft.id);
});
it("flags an OS-sized gap and jump using real GPS time", () => {
  const previous = { ...point(0, 0), wallTime: 1000 };
  expect(hasGPSGap(previous, { lat: 0, lng: 0.01, timestamp: 182000 })).toBe(
    true,
  );
  expect(hasGPSGap(previous, { lat: 0, lng: 0.0001, timestamp: 182000 })).toBe(
    false,
  );
  expect(hasGPSGap(previous, { lat: 0, lng: 0.01, timestamp: 180000 })).toBe(
    false,
  );
});
