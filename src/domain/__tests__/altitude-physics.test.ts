import { describe, it, expect } from "vitest";
import {
  calculateEffectiveO2,
  oxygenRatio,
  packWeightPenalty,
  calculateAlpineTime,
  getHydrationGoal,
} from "../altitude-physics";

describe("calculateEffectiveO2", () => {
  it("returns 100 for null altitude", () => {
    expect(calculateEffectiveO2(null)).toBe(100);
  });

  it("returns 100 for 0m altitude", () => {
    expect(calculateEffectiveO2(0)).toBe(100);
  });

  it("returns ~70% at 3000m", () => {
    const o2 = calculateEffectiveO2(3000);
    expect(o2).toBeGreaterThan(68);
    expect(o2).toBeLessThan(72);
  });

  it("returns ~53% at 5364m (EBC)", () => {
    const o2 = calculateEffectiveO2(5364);
    expect(o2).toBeGreaterThan(50);
    expect(o2).toBeLessThan(55);
  });
});

describe("oxygenRatio", () => {
  it("returns 1 at sea level", () => {
    expect(oxygenRatio(0)).toBeCloseTo(1, 4);
  });

  it("returns ~0.70 at 3000m", () => {
    expect(oxygenRatio(3000)).toBeCloseTo(0.6977, 2);
  });
});

describe("packWeightPenalty", () => {
  it("returns 1 for 10kg or less", () => {
    expect(packWeightPenalty(10)).toBe(1);
    expect(packWeightPenalty(5)).toBe(1);
  });

  it("returns 0.85 for 20kg", () => {
    expect(packWeightPenalty(20)).toBeCloseTo(0.85, 4);
  });

  it("floors at 0.5", () => {
    expect(packWeightPenalty(100)).toBe(0.5);
  });
});

describe("calculateAlpineTime", () => {
  it("returns correct sea-level time", () => {
    const result = calculateAlpineTime(5, 300, 0, 10);
    // T0 = 5/5 + 300/600 = 1 + 0.5 = 1.5 hours
    expect(result.seaLevelHours).toBeCloseTo(1.5, 4);
  });

  it("alpine time > sea level at altitude", () => {
    const result = calculateAlpineTime(5, 300, 4000, 15);
    expect(result.alpineHours).toBeGreaterThan(result.seaLevelHours);
    expect(result.slowdownPercent).toBeGreaterThan(0);
  });

  it("slowdown increases with altitude", () => {
    const r1 = calculateAlpineTime(5, 300, 3000, 10);
    const r2 = calculateAlpineTime(5, 300, 5000, 10);
    expect(r2.slowdownPercent).toBeGreaterThan(r1.slowdownPercent);
  });
});

describe("getHydrationGoal", () => {
  it("returns 12 glasses below 2500m", () => {
    expect(getHydrationGoal(2000)).toEqual({ glasses: 12, liters: 3.0 });
  });

  it("returns 15 glasses at 2500-3999m", () => {
    expect(getHydrationGoal(3000)).toEqual({ glasses: 15, liters: 3.75 });
  });

  it("returns 18 glasses at 4000m+", () => {
    expect(getHydrationGoal(5000)).toEqual({ glasses: 18, liters: 4.5 });
  });

  it("handles null altitude", () => {
    expect(getHydrationGoal(null)).toEqual({ glasses: 12, liters: 3.0 });
  });
});
