import { describe, expect, it } from "vitest";
import type { HikeTrack } from "@/types/trek.types";
import { exportInteractiveHTMLReport } from "../report-export.service";

function fixture(): HikeTrack {
  return {
    id: "test",
    name: "Field log",
    region: "Test region",
    createdAt: 1700000000000,
    source: "recorded",
    points: Array.from({ length: 5 }, (_, index) => ({
      lat: 30 + index / 100,
      lng: -90,
      ele: 100 + index * 20,
      time: 1700000000000 + index * 60000,
      cumDistKm: index,
      gradePct: 2,
    })),
    pins: [0, 2, 4].map((index) => ({
      id: String(index),
      lat: 30 + index / 100,
      lng: -90,
      ele: 100 + index * 20,
      cumDistKm: index,
      timestamp: 1700000000000,
      caption: `Note ${index}`,
    })),
    stats: {
      totalDistKm: 4,
      elevationGainM: 80,
      elevationLossM: 0,
      maxAltitudeM: 180,
      minAltitudeM: 100,
      maxGradePct: 2,
      durationSec: 240,
      verticalRateMh: 0,
      paceMinPerKm: "— /km",
    },
  };
}

function payload(html: string): { track: HikeTrack; gpx: string } {
  return JSON.parse(
    html.match(
      /<script id="track-data" type="application\/json">([\s\S]*?)<\/script>/,
    )![1],
  );
}

describe("interactive report export", () => {
  it("embeds the route and GPX without external script or stylesheet dependencies", () => {
    const html = exportInteractiveHTMLReport(fixture(), 0);
    expect(html).toContain("Leaflet license:");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
    expect(payload(html).gpx).toContain("<trkpt");
    expect(payload(html).track.points).toHaveLength(5);
    expect(payload(html).track.points[0].time).toBe(1700000000000);
  });

  it("removes private endpoints, notes, identifiers and exact times from embedded data and GPX", () => {
    const original = fixture();
    const before = JSON.stringify(original);
    const html = exportInteractiveHTMLReport(original, 500);
    const data = payload(html);
    expect(data.track.points.map((p) => p.cumDistKm)).toEqual([1, 2, 3]);
    expect(data.track.pins.map((p) => p.caption)).toEqual(["Note 2"]);
    expect(data.track.points.every((p) => p.time === undefined)).toBe(true);
    expect(data.track.createdAt).toBe(0);
    expect(data.track.pins[0].timestamp).toBe(0);
    expect(data.gpx).not.toContain("<time>");
    expect(data.gpx).not.toContain('lat="30"');
    expect(data.gpx).not.toContain('lat="30.04"');
    expect(html).not.toContain("1700000000000");
    expect(JSON.stringify(original)).toBe(before);
  });

  it("keeps hostile names and captions as data", () => {
    const track = fixture();
    track.name = '</script><script>alert("injected")</script>';
    track.pins[1].caption = "<img src=x onerror=alert(1)>";
    const html = exportInteractiveHTMLReport(track, 0);
    expect(html).not.toContain('<script>alert("injected")</script>');
    expect(html).not.toContain("<img src=x");
    expect(payload(html).track.name).toBe(track.name);
    expect(payload(html).track.pins[1].caption).toBe(track.pins[1].caption);
  });

  it("rejects a privacy request that the domain short-track guard cannot apply", () => {
    const track = fixture();
    track.points = track.points.slice(0, 2);
    expect(() => exportInteractiveHTMLReport(track, 500)).toThrow("too short");
  });

  it("drops remote and SVG photo URLs while retaining embedded raster photos", () => {
    const track = fixture();
    track.pins[0].photoDataUrl = "https://example.com/photo.jpg";
    track.pins[1].photoDataUrl = "data:image/svg+xml;base64,PHN2Zz4=";
    track.pins[2].photoDataUrl = "data:image/webp;base64,AAAA";
    const pins = payload(exportInteractiveHTMLReport(track, 0)).track.pins;
    expect(pins[0].photoDataUrl).toBeUndefined();
    expect(pins[1].photoDataUrl).toBeUndefined();
    expect(pins[2].photoDataUrl).toBe(track.pins[2].photoDataUrl);
  });
});

it("the portable interactive story uses a keyboard chart instead of a range input", () => {
  const html = exportInteractiveHTMLReport(fixture(), 0);
  expect(html).not.toContain('type="range"');
  expect(html).toContain('id="story-progress"');
  expect(html).toContain('aria-label="Trail point"');
  expect(html).toContain('"ArrowRight"');
});

it("exports real photo locations without fabricating or offering a GPX route", () => {
  const track = fixture();
  track.points = [];
  track.timedSession = true;
  track.pins = track.pins
    .slice(0, 2)
    .map((pin) => ({
      ...pin,
      photoDataUrl: "data:image/jpeg;base64,AAAA",
      offTrail: true,
      cumDistKm: 0,
    }));
  const html = exportInteractiveHTMLReport(track, 0),
    data = payload(html);
  expect(data.track.points).toEqual([]);
  expect(data.track.pins.map((pin) => [pin.lat, pin.lng])).toEqual(
    track.pins.map((pin) => [pin.lat, pin.lng]),
  );
  expect(data.gpx).toBe("");
  expect(html).toContain("Photo locations · no GPS trail recorded");
  expect(html).toContain('el("download").hidden = true');
});
