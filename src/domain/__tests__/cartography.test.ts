import { describe, expect, it } from "vitest";
import { projectRoute, smoothCurve } from "../cartography";
import { point } from "./helpers/tracks";

describe("receipt route projection", () => {
  it("preserves proportions and contains an antimeridian route inside its frame", () => {
    const projected = projectRoute(
      [
        { ...point(0), lat: 0, lng: 179.99 },
        { ...point(1), lat: 0.01, lng: -179.99 },
      ],
      200,
      120,
      10,
    );
    expect(Math.abs(projected[1].x - projected[0].x)).toBeCloseTo(180);
    expect(Math.abs(projected[1].y - projected[0].y)).toBeCloseTo(90);
    expect(
      projected.every(
        (point) =>
          point.x >= 10 && point.x <= 190 && point.y >= 10 && point.y <= 110,
      ),
    ).toBe(true);
  });
  it("centers one fix and accepts an empty recording", () => {
    expect(projectRoute([point(0)], 200, 120)).toEqual([{ x: 100, y: 60 }]);
    expect(projectRoute([], 200, 120)).toEqual([]);
  });
  it("keeps the profile's summit flat at its turning point without overshooting", () => {
    const curve = smoothCurve([
      { x: 0, y: 80 },
      { x: 100, y: 20 },
      { x: 200, y: 80 },
    ]);
    expect(curve[0].c2y).toBe(20);
    expect(curve[1].c1y).toBe(20);
    expect(
      curve.every(
        (point) =>
          point.c1y >= 20 &&
          point.c1y <= 80 &&
          point.c2y >= 20 &&
          point.c2y <= 80,
      ),
    ).toBe(true);
  });
});
