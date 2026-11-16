import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SIGNATURE_TRACKS, signatureTracks } from "@/data/signature-tracks";
import { parseGPX, serializeGPX } from "../gpx-engine";
import { TestDOMParser } from "./helpers/xml-parser";
import { exportInteractiveHTMLReport } from "@/services/report-export.service";

beforeAll(() => vi.stubGlobal("DOMParser", TestDOMParser));
afterAll(() => vi.unstubAllGlobals());

describe("global signature routes", () => {
  it.each(
    SIGNATURE_TRACKS.map(
      (track, index) =>
        [track, [19.3, 23.8, 16.4][index], [180, 1460, 640][index]] as const,
    ),
  )(
    "round trips the geographic distance and ascent for $0.name",
    (track, distance, gain) => {
      const parsed = parseGPX(serializeGPX(track));
      expect(track.points).toHaveLength(113);
      expect(
        Math.abs(parsed.stats.totalDistKm - track.stats.totalDistKm),
      ).toBeLessThan(0.01);
      expect(parsed.stats.totalDistKm).toBeCloseTo(distance, 5);
      expect(parsed.stats.elevationGainM).toBeCloseTo(gain, 5);
      expect(parsed.stats.durationSec).toBe(track.stats.durationSec);
    },
  );

  it("keeps three scenic field notes without synthetic preset photo assets", () => {
    for (const track of SIGNATURE_TRACKS) {
      expect(track.pins).toHaveLength(3);
      for (const pin of track.pins) {
        expect(pin.photoDataUrl).toBeUndefined();
        expect(pin.caption.length).toBeGreaterThan(20);
      }
      const html = exportInteractiveHTMLReport(track, 0);
      expect(html).not.toContain("data:image/svg+xml;charset=utf-8,");
    }
  });

  it("returns detached library copies instead of modifying the preset definitions", () => {
    const original = SIGNATURE_TRACKS[0].points[0].ele;
    signatureTracks()[0].points[0].ele = -999;
    expect(SIGNATURE_TRACKS[0].points[0].ele).toBe(original);
  });
});
