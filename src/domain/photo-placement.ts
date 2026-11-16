import type { HikeTrack, SpatialPin, TrackPoint } from "@/types/trek.types";
import { snapToTrack } from "./gpx-engine";
import { locateOnTrail, trailIndexAtDistance } from "./trail-navigation";
export const DEFAULT_PLACEMENT_CENTER: [number, number] = [37.732, -119.558];
export function placePhotoAtCoordinate(
  pin: SpatialPin,
  track: HikeTrack,
  lat: number,
  lng: number,
  snap?: boolean,
): SpatialPin {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    throw new Error("Choose a valid map location.");
  const placed = {
    ...pin,
    placementSource: "map" as const,
    exifSource: "manual" as const,
  };
  if (!track.points.length)
    return { ...placed, lat, lng, cumDistKm: 0, ele: 0, offTrail: true };
  const nearest = snapToTrack(lat, lng, track.points);
  const projection = locateOnTrail(lat, lng, track.points);
  // Omitted preference retains nearby automatic snapping; an explicit false means exact coordinates.
  if (
    snap === true ||
    (snap === undefined && !track.freeRoam && projection.offTrackMeters <= 300)
  )
    return {
      ...placed,
      lat: nearest.point.lat,
      lng: nearest.point.lng,
      ele: nearest.point.ele,
      cumDistKm: nearest.point.cumDistKm,
      offTrail: false,
    };
  return {
    ...placed,
    lat,
    lng,
    ele: nearest.point.ele,
    cumDistKm: projection.distanceKm,
    offTrail: true,
  };
}
export function createFieldNote(
  track: HikeTrack,
  initialIndex = 0,
  center?: [number, number],
): SpatialPin {
  const point =
    track.points[Math.max(0, Math.min(track.points.length - 1, initialIndex))];
  const at = center ?? DEFAULT_PLACEMENT_CENTER;
  return {
    id: crypto.randomUUID(),
    lat: point?.lat ?? at[0],
    lng: point?.lng ?? at[1],
    ele: point?.ele ?? 0,
    cumDistKm: point?.cumDistKm ?? 0,
    timestamp: point?.wallTime ?? point?.time ?? Date.now(),
    caption: "Field note",
    exifSource: "manual",
    placementSource: "map",
    offTrail: !point,
  };
}
/** Route-distance spacing keeps a batch separate even when samples are uneven. */
export function distributedPhotoIndex(
  points: TrackPoint[],
  rank: number,
  count: number,
): number {
  if (!points.length) return 0;
  const start = points[0].cumDistKm,
    end = points[points.length - 1].cumDistKm;
  return trailIndexAtDistance(
    points,
    start + ((end - start) * (rank + 1)) / (count + 1),
  );
}
export function placeUnmatchedBatch(
  pins: SpatialPin[],
  track: HikeTrack,
  fallbackIndex?: number,
): SpatialPin[] {
  if (track.points.length < 2 || track.freeRoam || track.id.startsWith("roam"))
    return pins;
  const eligible = (pin: SpatialPin) =>
    pin.offTrail !== true &&
    pin.exifSource === "manual" &&
    pin.placementSource !== "map" &&
    (track.source !== "planned" || pin.placementSource === "fallback");
  const unmatched = pins.filter(eligible);
  const ordered = [...unmatched].sort((a, b) =>
    a.timestamp && b.timestamp ? a.timestamp - b.timestamp : 0,
  );
  return pins.map((pin) => {
    if (!eligible(pin)) return pin;
    const index =
      pins.length > 1
        ? distributedPhotoIndex(
            track.points,
            ordered.indexOf(pin),
            unmatched.length,
          )
        : Math.max(0, Math.min(track.points.length - 1, fallbackIndex ?? 0));
    const point = track.points[index];
    return {
      ...pin,
      lat: point.lat,
      lng: point.lng,
      ele: point.ele,
      cumDistKm: point.cumDistKm,
      placementSource: "fallback",
    };
  });
}
