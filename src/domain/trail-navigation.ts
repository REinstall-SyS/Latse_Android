import type { HikeTrack, TrackPoint } from "@/types/trek.types";
import { haversineDistance } from "./geospatial";
import { calculateGhostDelta } from "./gpx-engine";

export function formatTrailTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.max(0, Math.round(seconds / 60));
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
    : `${minutes} min`;
}

export function formatGhostPace(deltaSec: number | null): string {
  if (deltaSec === null) return "Reference has no usable timestamps";
  const seconds = Math.round(Math.abs(deltaSec));
  return seconds < 1
    ? "ON GHOST PACE"
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s ${deltaSec < 0 ? "AHEAD OF GHOST PACE" : "BEHIND GHOST PACE"}`;
}

/** Project to route segments so sparse fixes do not create false off-route warnings. */
export function locateOnTrail(
  lat: number,
  lng: number,
  points: TrackPoint[],
  previousDistance?: number,
): {
  distanceKm: number;
  offTrackMeters: number;
  index: number;
  segmentStart: number;
  fraction: number;
} {
  if (!points.length) throw new Error("Choose a trail with GPS points.");
  const cosine = Math.max(0.001, Math.cos((lat * Math.PI) / 180));
  const x = (longitude: number) =>
    (((longitude - lng + 540) % 360) - 180) * cosine * 111195;
  const y = (latitude: number) => (latitude - lat) * 111195;
  let best = {
    distanceKm: points[0].cumDistKm,
    offTrackMeters:
      haversineDistance(lat, lng, points[0].lat, points[0].lng) * 1000,
    index: 0,
    segmentStart: 0,
    fraction: 0,
  };
  let bestScore = Infinity;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1],
      b = points[index];
    const ax = x(a.lng),
      ay = y(a.lat),
      dx = (((b.lng - a.lng + 540) % 360) - 180) * cosine * 111195,
      dy = y(b.lat) - ay;
    const t = Math.max(
      0,
      Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
    );
    const offTrackMeters = Math.hypot(ax + dx * t, ay + dy * t);
    const distanceKm = a.cumDistKm + (b.cumDistKm - a.cumDistKm) * t;
    // Resolve overlapping out-and-back legs near the last accepted progress.
    const continuity =
      previousDistance === undefined
        ? 0
        : Math.min(12, Math.abs(distanceKm - previousDistance) * 8);
    if (offTrackMeters + continuity < bestScore) {
      bestScore = offTrackMeters + continuity;
      best = {
        distanceKm,
        offTrackMeters,
        index: t < 0.5 ? index - 1 : index,
        segmentStart: index - 1,
        fraction: t,
      };
    }
  }
  return best;
}

export function trailProgress(distanceKm: number, track: HikeTrack): number {
  const first = track.points[0].cumDistKm;
  const span = track.points[track.points.length - 1].cumDistKm - first;
  return span > 0 ? Math.max(0, Math.min(1, (distanceKm - first) / span)) : 0;
}

export function ghostArrivalSeconds(
  distanceKm: number,
  track: HikeTrack,
): number | null {
  const result = calculateGhostDelta(distanceKm, 0, track);
  return result.deltaSec === null ? null : Math.max(0, -result.deltaSec);
}

export function trailIndexAtDistance(
  points: TrackPoint[],
  distanceKm: number,
): number {
  let left = 0,
    right = points.length - 1;
  while (left < right) {
    const mid = (left + right) >>> 1;
    if (points[mid].cumDistKm < distanceKm) left = mid + 1;
    else right = mid;
  }
  return left > 0 &&
    distanceKm - points[left - 1].cumDistKm <
      points[left].cumDistKm - distanceKm
    ? left - 1
    : left;
}
