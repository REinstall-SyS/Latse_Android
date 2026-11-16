import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SIGNATURE_TRACKS } from "@/data/signature-tracks";
import { TestDOMParser } from "@/domain/__tests__/helpers/xml-parser";
import { buildQuickRoute } from "@/domain/route-builder";
import {
  encodeLatseRoute,
  importRouteFile,
  latseRouteLink,
  parseTrailInput,
} from "../route-import.service";
import { exportInteractiveHTMLReport } from "../report-export.service";

beforeAll(() => vi.stubGlobal("DOMParser", TestDOMParser));
afterAll(() => vi.unstubAllGlobals());

describe("mobile route exchange", () => {
  it("round trips a Unicode route code/link and recomputes statistics", () => {
    const original = { ...SIGNATURE_TRACKS[0], name: "Crête & forêt 🏔️" };
    for (const input of [
      encodeLatseRoute(original),
      latseRouteLink(original),
      `https://example.com/#route=${encodeURIComponent(encodeLatseRoute(original))}`,
    ]) {
      const track = parseTrailInput(input);
      expect(track.name).toBe(original.name);
      expect(track.stats.totalDistKm).toBeCloseTo(
        original.stats.totalDistKm,
        8,
      );
      expect(track.points.map((point) => point.time)).toEqual(
        original.points.map((point) => point.time),
      );
      expect(track.pins).toHaveLength(3);
      expect(track.pins.every((pin) => pin.photoDataUrl === undefined)).toBe(
        true,
      );
    }
    expect(encodeLatseRoute(original)).not.toContain("data:image");
  });

  it("accepts GPX text and a phone file with filename fallback", async () => {
    const gpx =
      '<gpx><rte><rtept lat="0" lon="0"/><rtept lat="0" lon="0.01"/></rte></gpx>';
    expect(parseTrailInput(gpx).stats.totalDistKm).toBeCloseTo(1.1119492664, 8);
    const track = await importRouteFile(
      new File([gpx], "Morning-walk.gpx", { type: "application/gpx+xml" }),
    );
    expect(track.name).toBe("Morning-walk");
    expect(track.source).toBe("imported");
  });

  it("validates pasted JSON and ignores forged stats, source, ids, and photo URLs", () => {
    const track = parseTrailInput(
      JSON.stringify({
        id: "forged",
        name: "Shared route",
        source: "recorded",
        stats: { totalDistKm: 9000 },
        points: [
          { lat: 0, lng: 0 },
          { lat: 0, lng: 0.01 },
        ],
        pins: [
          {
            lat: 0,
            lng: 0,
            caption: "<script>text only</script>",
            photoDataUrl: "https://example.com/photo.jpg",
            timestamp: 1e20,
          },
          { lat: 91, lng: 0 },
        ],
      }),
    );
    expect(track.id).not.toBe("forged");
    expect(track.source).toBe("imported");
    expect(track.stats.totalDistKm).toBeCloseTo(1.1119492664, 8);
    expect(track.pins).toHaveLength(1);
    expect(track.pins[0]).toMatchObject({
      timestamp: 0,
      caption: "<script>text only</script>",
    });
    expect(track.pins[0].photoDataUrl).toBeUndefined();
  });

  it("preserves the estimated-plan label through codes and HTML export", () => {
    const plan = buildQuickRoute([
      { lat: 0, lng: 0, ele: 10 },
      { lat: 0, lng: 0.01, ele: 30 },
      { lat: 0.01, lng: 0.01, ele: 10 },
    ]);
    const track = parseTrailInput(encodeLatseRoute(plan));
    expect(track.source).toBe("planned");
    expect(track.elevationEstimated).toBe(true);
    expect(exportInteractiveHTMLReport(track, 0)).toContain(
      "Planned route · straight-line segments · estimated elevations",
    );
  });

  it.each([
    "",
    "not a route",
    "LATSE1:%%%invalid",
    '<gpx><trkpt lat="0" lon="0"/></gpx>',
    "https://www.strava.com/routes/12345",
    '{"version":2,"points":[]}',
    '{"points":[{"lat":"0","lng":0},{"lat":0,"lng":1}]}',
  ])("explains unsupported or damaged input: %s", (input) => {
    expect(() => parseTrailInput(input)).toThrow();
  });

  it("bounds file and payload size before doing expensive route work", async () => {
    const file = { size: 5 * 1024 * 1024, text: vi.fn() } as unknown as File;
    await expect(importRouteFile(file)).rejects.toThrow("4 MB");
    expect(file.text).not.toHaveBeenCalled();
    expect(() =>
      parseTrailInput(" ".repeat(4 * 1024 * 1024 + 1) + "{}"),
    ).toThrow("too large");
    expect(() =>
      parseTrailInput(
        JSON.stringify({ points: Array(25001).fill({ lat: 0, lng: 0 }) }),
      ),
    ).toThrow("25,000");
  });
});
