import type { HikeTrack, TrackPoint } from "@/types/trek.types";

export const START_MS = Date.UTC(2025, 8, 14, 7);
export function point(
  distanceKm: number,
  elapsedSec?: number,
  elevation = 100,
): TrackPoint {
  return {
    lat: 0,
    lng: distanceKm / 100,
    ele: elevation,
    cumDistKm: distanceKm,
    gradePct: 5,
    ...(elapsedSec === undefined ? {} : { time: START_MS + elapsedSec * 1000 }),
  };
}
export function trackWith(points: TrackPoint[]): HikeTrack {
  return {
    id: "test-track",
    name: "Test hike",
    region: "Test region",
    createdAt: START_MS,
    source: "recorded",
    points,
    pins: [],
    stats: {
      totalDistKm: points[points.length - 1]?.cumDistKm ?? 0,
      elevationGainM: 0,
      elevationLossM: 0,
      maxAltitudeM: points.length ? Math.max(...points.map((p) => p.ele)) : 0,
      minAltitudeM: points.length ? Math.min(...points.map((p) => p.ele)) : 0,
      maxGradePct: 5,
      durationSec: null,
      verticalRateMh: 0,
      paceMinPerKm: "— /km",
    },
  };
}
export function elevationGPX(elevations: number[], spacingM = 10): string {
  return `<gpx><trk><trkseg>${elevations.map((ele, index) => `<trkpt lat="0" lon="${(index * spacingM) / 111194.92664455874}"><ele>${ele}</ele></trkpt>`).join("")}</trkseg></trk></gpx>`;
}
