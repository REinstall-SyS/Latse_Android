import { it, expect } from "vitest";
import { photoCropRect, fieldLogStamp } from "../receipt-layout";
import { signatureTracks } from "@/data/signature-tracks";
import type { ReceiptConfig } from "@/types/trek.types";
it("moves portrait cropping to top, center or bottom without stretching", () => {
  const box = { x: 10, y: 20, w: 100, h: 100 };
  expect(photoCropRect(100, 200, box, 0)).toEqual({
    x: 10,
    y: 20,
    w: 100,
    h: 200,
  });
  expect(photoCropRect(100, 200, box, 0.5).y).toBe(-30);
  expect(photoCropRect(100, 200, box, 1).y).toBe(-80);
  expect(photoCropRect(100, 200, box, 99).y).toBe(-80);
});
it("uses a real hike date and unit-aware summit, with an optional personal field note", () => {
  const track = signatureTracks()[1];
  track.createdAt = Date.UTC(2027, 0, 1, 18);
  track.points[0].wallTime = Date.UTC(2026, 10, 1, 18);
  expect(fieldLogStamp(track, { units: "imperial" } as ReceiptConfig)).toBe(
    "Nov 1, 2026 · Summit 8,842 ft",
  );
  expect(
    fieldLogStamp(track, {
      units: "metric",
      customQuote: "  Our first summit  ",
    } as ReceiptConfig),
  ).toBe("Our first summit");
});
