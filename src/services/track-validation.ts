import type {
  HikeTrack,
  SpatialPin,
  TrackPoint,
  TrailPhoto,
} from "@/types/trek.types";
import { embeddedPhoto } from "./artifact-track";
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object";
const coordinates = (v: Record<string, unknown>) =>
  finite(v.lat) &&
  Math.abs(v.lat) <= 90 &&
  finite(v.lng) &&
  Math.abs(v.lng) <= 180;
export function isStoredPoint(value: unknown): value is TrackPoint {
  return (
    object(value) &&
    coordinates(value) &&
    finite(value.ele) &&
    finite(value.cumDistKm) &&
    value.cumDistKm >= 0 &&
    finite(value.gradePct) &&
    (value.time === undefined || finite(value.time)) &&
    (value.wallTime === undefined || finite(value.wallTime))
  );
}
export function isStoredPin(value: unknown): value is SpatialPin {
  return (
    object(value) &&
    coordinates(value) &&
    typeof value.id === "string" &&
    typeof value.caption === "string" &&
    finite(value.ele) &&
    finite(value.cumDistKm) &&
    value.cumDistKm >= 0 &&
    finite(value.timestamp) &&
    (value.photoDataUrl === undefined ||
      (typeof value.photoDataUrl === "string" &&
        !!embeddedPhoto(value.photoDataUrl)))
  );
}
export function isStoredPhoto(value: unknown): value is TrailPhoto {
  return (
    object(value) &&
    typeof value.id === "string" &&
    typeof value.caption === "string" &&
    finite(value.timestamp) &&
    ((typeof value.photoDataUrl === "string" &&
      !!embeddedPhoto(value.photoDataUrl)) ||
      (value.photoDataUrl === undefined && typeof value.photoRef === "string"))
  );
}
/** Validate each stored hike independently so one damaged entry cannot break navigation. */
export function isStoredHike(value: unknown): value is HikeTrack {
  if (
    !object(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.name !== "string" ||
    typeof value.region !== "string" ||
    !finite(value.createdAt) ||
    !["recorded", "imported", "preset", "planned"].includes(
      String(value.source),
    )
  )
    return false;
  if (
    !Array.isArray(value.points) ||
    !value.points.every(isStoredPoint) ||
    (!value.points.length && value.timedSession !== true)
  )
    return false;
  if (
    value.points.some(
      (p, i, points) => i > 0 && p.cumDistKm < points[i - 1].cumDistKm,
    )
  )
    return false;
  if (
    !Array.isArray(value.pins) ||
    !value.pins.every(isStoredPin) ||
    (value.unplacedPhotos !== undefined &&
      (!Array.isArray(value.unplacedPhotos) ||
        !value.unplacedPhotos.every(isStoredPhoto)))
  )
    return false;
  const s = value.stats;
  return (
    object(s) &&
    [
      "totalDistKm",
      "elevationGainM",
      "elevationLossM",
      "maxAltitudeM",
      "minAltitudeM",
      "maxGradePct",
      "verticalRateMh",
    ].every((key) => finite(s[key])) &&
    typeof s.paceMinPerKm === "string" &&
    (s.durationSec === null || (finite(s.durationSec) && s.durationSec >= 0))
  );
}
