import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fixture from "../../../tests/fixtures/creek-ridge.gpx?raw";
import {
  applyPrivacyTrim,
  calculateGhostDelta,
  interpolateTrackByTime,
  parseGPX,
  serializeGPX,
  snapToTrack,
} from "../gpx-engine";
import { calculateVerticalRate } from "../altitude-physics";
import { TestDOMParser } from "./helpers/xml-parser";
import { elevationGPX, point, START_MS, trackWith } from "./helpers/tracks";

beforeAll(() => vi.stubGlobal("DOMParser", TestDOMParser));
afterAll(() => vi.unstubAllGlobals());

describe("parseGPX", () => {
  it("reads the fixture coordinates, timestamps, distance, elevation and effort statistics", () => {
    const track = parseGPX(fixture);
    expect(track.name).toBe("Creek Ridge verification");
    expect(track.source).toBe("imported");
    expect(track.points).toHaveLength(4);
    expect(track.points[0]).toMatchObject({
      lat: 30.7,
      lng: -89.1,
      ele: 50,
      time: START_MS,
      cumDistKm: 0,
    });
    expect(track.stats.totalDistKm).toBeCloseTo(3.3358477993, 8);
    track.points.forEach((p, index) =>
      expect(p.cumDistKm).toBeCloseTo(index * 1.1119492664, 8),
    );
    expect(track.stats).toMatchObject({
      elevationGainM: 90,
      elevationLossM: 60,
      maxAltitudeM: 140,
      minAltitudeM: 50,
      durationSec: 3600,
      verticalRateMh: calculateVerticalRate(90, 3600),
    });
  });

  it("supports unnamespaced route points, zero coordinates and a fallback name", () => {
    const track = parseGPX(
      '<gpx><rte><rtept lat="0" lon="0"/><rtept lat="0" lon="0.01"><ele>bad</ele><time>invalid</time></rtept></rte></gpx>',
      "Watch route",
    );
    expect(track.name).toBe("Watch route");
    expect(track.points.map((p) => p.ele)).toEqual([0, 0]);
    expect(track.points.every((p) => p.time === undefined)).toBe(true);
    expect(track.stats.durationSec).toBeNull();
    expect(track.stats.totalDistKm).toBeCloseTo(1.1119492664, 8);
  });

  it("accepts a GPX namespace prefix and decodes XML text", () => {
    const track = parseGPX(
      '<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:trk><g:name>Ridge &amp; river</g:name><g:trkseg><g:trkpt lat="1" lon="2"><g:ele>250</g:ele></g:trkpt></g:trkseg></g:trk></g:gpx>',
    );
    expect(track.name).toBe("Ridge & river");
    expect(track.points[0].ele).toBe(250);
  });

  it("prefers track points when the file also contains route points", () => {
    const track = parseGPX(
      '<gpx><rte><rtept lat="1" lon="1"/></rte><trk><trkseg><trkpt lat="2" lon="2"/></trkseg></trk></gpx>',
    );
    expect(track.points).toHaveLength(1);
    expect(track.points[0].lat).toBe(2);
  });

  it("supports metadata names and Unix epoch timestamps", () => {
    const track = parseGPX(
      '<gpx><metadata><name>Metadata name</name><desc>Alpine region</desc><time>1970-01-01T00:00:00Z</time></metadata><rte><rtept lat="0" lon="0"><time>1970-01-01T00:00:00Z</time></rtept><rtept lat="0" lon="0.01"><time>1970-01-01T00:01:00Z</time></rtept></rte></gpx>',
    );
    expect(track.name).toBe("Metadata name");
    expect(track.region).toBe("Alpine region");
    expect(track.createdAt).toBe(0);
    expect(track.points[0].time).toBe(0);
    expect(track.stats.durationSec).toBe(60);
  });

  it.each(["<gpx/>", "<gpx><trk><trkseg/></trk></gpx>"])(
    "rejects a route with no fixes: %s",
    (xml) => {
      expect(() => parseGPX(xml)).toThrow("no track or route points");
    },
  );

  it.each([
    "",
    "<html/>",
    "<gpx><trk></gpx>",
    '<gpx><trkpt lat="1" lon="2"></gpx>',
  ])("rejects invalid GPX XML: %s", (xml) => {
    expect(() => parseGPX(xml)).toThrow("Invalid GPX XML");
  });

  it.each([
    'lat="91" lon="0"',
    'lat="0" lon="181"',
    'lat="NaN" lon="0"',
    'lat="0"',
    'lat=" " lon="0"',
  ])("rejects invalid or missing coordinates: %s", (attributes) => {
    expect(() =>
      parseGPX(`<gpx><rte><rtept ${attributes}/></rte></gpx>`),
    ).toThrow(/coordinates/);
  });

  it("handles a single fix and one timestamp without inventing a duration", () => {
    const track = parseGPX(
      '<gpx><rte><rtept lat="0" lon="0"><ele>-20</ele><time>2025-01-01T00:00:00Z</time></rtept></rte></gpx>',
    );
    expect(track.stats).toMatchObject({
      totalDistKm: 0,
      elevationGainM: 0,
      elevationLossM: 0,
      maxGradePct: 0,
      minAltitudeM: -20,
      maxAltitudeM: -20,
      verticalRateMh: 0,
      durationSec: null,
    });
  });
});

describe("elevation statistics and grade smoothing", () => {
  it.each([
    { profile: [100, 101, 99, 102, 100], gain: 0, loss: 0 },
    { profile: [100, 102, 104, 106, 108], gain: 8, loss: 0 },
    { profile: [108, 106, 104, 102, 100], gain: 0, loss: 8 },
    { profile: [100, 110, 108, 112, 108, 102, 105, 110], gain: 20, loss: 10 },
  ])("applies 4 m hysteresis to $profile", ({ profile, gain, loss }) => {
    const { stats } = parseGPX(elevationGPX(profile));
    expect(stats.elevationGainM).toBe(gain);
    expect(stats.elevationLossM).toBe(loss);
  });

  it("preserves the slope of a steady climb over a 50 m or longer window", () => {
    const track = parseGPX(
      elevationGPX(Array.from({ length: 21 }, (_, i) => 100 + i)),
    );
    track.points.forEach((p) => expect(p.gradePct).toBeCloseTo(10, 7));
  });

  it("smooths isolated GPS elevation spikes and bounds every grade", () => {
    const elevations = Array(21).fill(100);
    elevations[10] = 250;
    const track = parseGPX(elevationGPX(elevations));
    expect(track.points[10].gradePct).toBe(0);
    expect(
      track.points.every(
        (p) => Number.isFinite(p.gradePct) && Math.abs(p.gradePct) <= 50,
      ),
    ).toBe(true);
  });

  it("does not invent steep gradients on short or stationary tracks", () => {
    expect(
      parseGPX(elevationGPX([100, 200, 300], 10)).points.every(
        (p) => p.gradePct === 0,
      ),
    ).toBe(true);
    expect(
      parseGPX(elevationGPX([100, 200, 300], 0)).points.every(
        (p) => p.gradePct === 0,
      ),
    ).toBe(true);
  });
});

describe("serializeGPX", () => {
  it("round trips track geometry, times, stats and escaped field-note text", () => {
    const original = parseGPX(fixture);
    original.name = 'Ridge & river <field log> "2025"';
    original.pins = [
      {
        id: "summit",
        ...original.points[2],
        timestamp: original.points[2].time!,
        caption: "Rock & ice <summit> \"view\" 'note'",
      },
    ];
    const before = JSON.stringify(original);
    const xml = serializeGPX(original);
    const restored = parseGPX(xml);
    expect(restored.name).toBe(original.name);
    expect(restored.points).toEqual(original.points);
    expect(restored.stats).toEqual(original.stats);
    expect(restored.pins[0]).toMatchObject({
      caption: original.pins[0].caption,
      lat: original.pins[0].lat,
      lng: original.pins[0].lng,
      ele: original.pins[0].ele,
      timestamp: original.pins[0].timestamp,
      cumDistKm: original.pins[0].cumDistKm,
    });
    expect(xml).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(JSON.stringify(original)).toBe(before);
  });

  it("writes waypoint children in the order required by GPX 1.1", () => {
    // https://www.topografix.com/GPX/1/1/#type_wptType
    const track = trackWith([point(0, 0)]);
    track.pins = [
      {
        id: "note",
        lat: 0,
        lng: 0,
        ele: 100,
        cumDistKm: 0,
        timestamp: START_MS,
        caption: "Note",
      },
    ];
    const doc = new TestDOMParser().parseFromString(
      serializeGPX(track),
      "text/xml",
    );
    const waypoint = doc.getElementsByTagName("wpt")[0];
    const children = Array.from(waypoint.childNodes)
      .filter((node) => node.nodeType === 1)
      .map((node) => (node as Element).localName);
    expect(children).toEqual(["ele", "time", "name"]);
  });

  it("removes endpoint fixes and pins and strips every exact time in privacy mode", () => {
    const track = trackWith(
      [0, 0.5, 1, 1.5, 2].map((d, i) => point(d, i * 60)),
    );
    track.pins = track.points.map((p, i) => ({
      id: `pin-${i}`,
      ...p,
      timestamp: p.time!,
      caption: `Note ${i}`,
    }));
    const before = JSON.stringify(track);
    const xml = serializeGPX(track, 500);
    const doc = new TestDOMParser().parseFromString(xml, "text/xml");
    expect(
      Array.from(doc.getElementsByTagName("trkpt")).map(
        (el) => +el.getAttribute("lon")!,
      ),
    ).toEqual([0.005, 0.01, 0.015]);
    expect(
      Array.from(doc.getElementsByTagName("wpt")).map(
        (el) => +el.getAttribute("lon")!,
      ),
    ).toEqual([0.005, 0.01, 0.015]);
    expect(doc.getElementsByTagName("time").length).toBe(0);
    expect(JSON.stringify(track)).toBe(before);
  });

  it("honors the short-track guard while still removing times when privacy was requested", () => {
    const track = trackWith([point(0, 0), point(1.5, 60)]);
    const doc = new TestDOMParser().parseFromString(
      serializeGPX(track, 500),
      "text/xml",
    );
    expect(doc.getElementsByTagName("trkpt").length).toBe(2);
    expect(doc.getElementsByTagName("time").length).toBe(0);
  });
});

describe("applyPrivacyTrim", () => {
  it("keeps boundary fixes and preserves cumulative distances without mutating the source", () => {
    const points = [0, 0.49, 0.5, 1, 1.5, 1.51, 2].map((d) => point(d));
    const before = JSON.stringify(points);
    expect(applyPrivacyTrim(points, 500).map((p) => p.cumDistKm)).toEqual([
      0.5, 1, 1.5,
    ]);
    expect(JSON.stringify(points)).toBe(before);
  });
  it.each([1, 1.5])(
    "preserves a short track with total distance %s km",
    (distance) => {
      const points = [point(0), point(distance)];
      expect(applyPrivacyTrim(points, 500)).toEqual(points);
    },
  );
  it("handles empty tracks, disabled trims and sparse routes", () => {
    expect(applyPrivacyTrim([], 500)).toEqual([]);
    const points = [point(0), point(2)];
    expect(applyPrivacyTrim(points, 0)).toEqual(points);
    expect(applyPrivacyTrim(points, 500)).toEqual([]);
  });
});

describe("snapToTrack", () => {
  it("accepts zero coordinates and returns the exact nearest fix and index", () => {
    const points = [point(0), point(1), point(2)];
    const result = snapToTrack(0, 0.01, points);
    expect(result).toEqual({ point: points[1], index: 1, offTrackMeters: 0 });
  });
  it("reports off-track distance in metres", () => {
    expect(snapToTrack(0.001, 0, [point(0)]).offTrackMeters).toBeCloseTo(
      111.19492664,
      6,
    );
  });
  it("uses the first fix for an exact tie", () => {
    expect(snapToTrack(0, 0, [point(0), point(0)]).index).toBe(0);
  });
  it("rejects empty tracks and invalid input coordinates", () => {
    expect(() => snapToTrack(0, 0, [])).toThrow("empty track");
    expect(() => snapToTrack(91, 0, [point(0)])).toThrow("Invalid coordinates");
  });
});

describe("interpolateTrackByTime", () => {
  it("returns the nearest timed fix and includes both endpoints", () => {
    const points = [point(0, 0), point(1), point(2, 60)];
    expect(interpolateTrackByTime(START_MS, points)).toBe(points[0]);
    expect(interpolateTrackByTime(START_MS + 40000, points)).toBe(points[2]);
    expect(interpolateTrackByTime(START_MS + 60000, points)).toBe(points[2]);
  });
  it("returns null outside the time range or without usable timestamps", () => {
    const points = [point(0, 0), point(1, 60)];
    expect(interpolateTrackByTime(START_MS - 1, points)).toBeNull();
    expect(interpolateTrackByTime(START_MS + 60001, points)).toBeNull();
    expect(interpolateTrackByTime(NaN, points)).toBeNull();
    expect(interpolateTrackByTime(START_MS, [point(0)])).toBeNull();
  });
});

describe("calculateGhostDelta", () => {
  const track = trackWith([
    point(0, 0, 100),
    point(1, 600, 200),
    point(3, 1800, 300),
  ]);
  it.each([
    { elapsed: 900, delta: -300, distance: 1.5 },
    { elapsed: 1200, delta: 0, distance: 2 },
    { elapsed: 1500, delta: 300, distance: 2.5 },
  ])(
    "compares the time at distance 2 km after $elapsed seconds",
    ({ elapsed, delta, distance }) => {
      const result = calculateGhostDelta(2, elapsed, track);
      expect(result.deltaSec).toBe(delta);
      expect(result.ghostPoint!.cumDistKm).toBeCloseTo(distance, 10);
      expect(result.ghostPoint!.time).toBe(START_MS + elapsed * 1000);
    },
  );
  it("clamps the ghost at start and finish and handles elapsed time after completion", () => {
    expect(calculateGhostDelta(0, 0, track)).toEqual({
      deltaSec: 0,
      ghostPoint: track.points[0],
    });
    expect(calculateGhostDelta(3, 2400, track)).toEqual({
      deltaSec: 600,
      ghostPoint: track.points[2],
    });
  });
  it("includes a stationary rest when comparing later pace", () => {
    const rested = trackWith([point(0, 0), point(0, 60), point(1, 660)]);
    expect(calculateGhostDelta(0.5, 300, rested).deltaSec).toBe(-60);
    expect(calculateGhostDelta(0, 30, rested).ghostPoint!.cumDistKm).toBe(0);
  });
  it.each([1, -1])(
    "crosses the antimeridian along the short arc in direction %s",
    (direction) => {
      const dateline = trackWith([
        { ...point(0, 0), lng: 179.99 * direction },
        { ...point(2, 60), lng: -179.99 * direction },
      ]);
      const ghost = calculateGhostDelta(1, 30, dateline);
      expect(Math.abs(ghost.ghostPoint!.lng)).toBeCloseTo(180, 8);
      expect(ghost.deltaSec).toBe(0);
    },
  );
  it("rejects unavailable, nonchronological and nonfinite pace inputs without mutation", () => {
    expect(calculateGhostDelta(1, 10, trackWith([point(0), point(1)]))).toEqual(
      { deltaSec: null, ghostPoint: null },
    );
    expect(calculateGhostDelta(1, 10, trackWith([point(0, 0)]))).toEqual({
      deltaSec: null,
      ghostPoint: null,
    });
    expect(
      calculateGhostDelta(1, 10, trackWith([point(0, 60), point(1, 0)])),
    ).toEqual({ deltaSec: null, ghostPoint: null });
    expect(calculateGhostDelta(NaN, 10, track).deltaSec).toBeNull();
    expect(calculateGhostDelta(1, Infinity, track).ghostPoint).toBeNull();
    const before = JSON.stringify(track);
    calculateGhostDelta(2, 900, track);
    expect(JSON.stringify(track)).toBe(before);
  });
});
