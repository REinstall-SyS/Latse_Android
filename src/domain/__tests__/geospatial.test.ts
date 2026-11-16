import { describe, it, expect } from "vitest";
import {
  haversineDistance,
  compassBearing,
  toDMS,
  shouldAcceptGPSFix,
  findNearestWaypoint,
} from "../geospatial";

describe("haversineDistance", () => {
  it("returns 0 for same point", () => {
    expect(haversineDistance(27.93, 86.8, 27.93, 86.8)).toBe(0);
  });

  it("calculates distance between Lukla and Namche", () => {
    const dist = haversineDistance(27.6869, 86.7314, 27.8068, 86.7139);
    expect(dist).toBeGreaterThan(13);
    expect(dist).toBeLessThan(14);
  });

  it("handles zero coordinates without treating them as falsy", () => {
    const dist = haversineDistance(0, 0, 0, 1);
    expect(dist).toBeGreaterThan(110);
    expect(dist).toBeLessThan(112);
  });

  it("returns 0 for NaN inputs", () => {
    expect(haversineDistance(NaN, 86.8, 27.93, 86.8)).toBe(0);
  });
});

describe("compassBearing", () => {
  it("returns ~0 for due north", () => {
    const bearing = compassBearing(27.0, 86.0, 28.0, 86.0);
    expect(bearing === 0 || bearing >= 359.5).toBe(true);
  });

  it("returns ~90 for due east", () => {
    const bearing = compassBearing(27.0, 86.0, 27.0, 87.0);
    expect(bearing).toBeGreaterThan(88);
    expect(bearing).toBeLessThan(92);
  });
});

describe("toDMS", () => {
  it("formats latitude correctly", () => {
    const result = toDMS(27.9881, true);
    expect(result).toContain("27°");
    expect(result).toContain("N");
  });

  it("formats negative longitude", () => {
    const result = toDMS(-86.925, false);
    expect(result).toContain("W");
  });

  it("rolls rounded seconds and minutes into the next degree", () => {
    expect(toDMS(27.99999, true)).toBe("28°00'00\"N");
    expect(toDMS(-86.99999, false)).toBe("87°00'00\"W");
    expect(toDMS(27 + 59 / 60 + 59.6 / 3600, true)).toBe("28°00'00\"N");
  });

  it.each([
    { value: 27 + 12 / 60 + 59.6 / 3600, lat: true, expected: "27°13'00\"N" },
    { value: -27.99999, lat: true, expected: "28°00'00\"S" },
    { value: 179.99999, lat: false, expected: "180°00'00\"E" },
    { value: 89.99999, lat: true, expected: "90°00'00\"N" },
    { value: 0, lat: true, expected: "0°00'00\"N" },
  ])("normalizes DMS components for $value", ({ value, lat, expected }) => {
    const result = toDMS(value, lat);
    expect(result).toBe(expected);
    expect(result).not.toMatch(/60['"]/);
  });
});

describe("shouldAcceptGPSFix", () => {
  it("rejects poor accuracy fixes", () => {
    const result = shouldAcceptGPSFix(27.0, 86.0, 27.0, 86.0, 50);
    expect(result.accept).toBe(false);
  });

  it("accepts first fix with good accuracy", () => {
    const result = shouldAcceptGPSFix(27.0, 86.0, null, null, 10);
    expect(result.accept).toBe(true);
  });

  it("rejects stationary drift < 10m", () => {
    const result = shouldAcceptGPSFix(27.0, 86.0, 27.00001, 86.00001, 5);
    expect(result.accept).toBe(false);
  });

  it("rejects teleportation > 5km", () => {
    const result = shouldAcceptGPSFix(28.0, 86.0, 27.0, 86.0, 5);
    expect(result.accept).toBe(false);
  });

  it("accepts normal walking distance", () => {
    // About 100m movement
    const result = shouldAcceptGPSFix(27.001, 86.0, 27.0, 86.0, 10);
    expect(result.accept).toBe(true);
    expect(result.distanceKm).toBeGreaterThan(0.05);
    expect(result.distanceKm).toBeLessThan(0.2);
  });
});

describe("findNearestWaypoint", () => {
  const waypoints = [
    { lat: 27.8932, lng: 86.8203, type: "medical", name: "Pheriche Aid Post" },
    { lat: 27.8068, lng: 86.7139, type: "town", name: "Namche Bazaar" },
  ];

  it("finds nearest medical", () => {
    const result = findNearestWaypoint(27.9, 86.82, waypoints, [
      "medical",
      "town",
    ]);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Pheriche Aid Post");
  });

  it("returns null when no matching type", () => {
    const result = findNearestWaypoint(27.9, 86.82, waypoints, ["start"]);
    expect(result).toBeNull();
  });
});
