import type { HikeTrack } from "@/types/trek.types";
import { applyPrivacyTrim } from "@/domain/gpx-engine";
import { withLocatedPhotos } from "@/domain/photo-map";
/** Only embedded raster photos are portable; remote resources and SVG are rejected. */
export function embeddedPhoto(value?: string): string | undefined {
  return value &&
    /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(value)
    ? value
    : undefined;
}

/** Storyboards carry only the moments the hiker placed and chose to share. */
export function prepareStoryboardTrack(
  track: HikeTrack,
  trimMeters: number,
): HikeTrack {
  const located = withLocatedPhotos(track);
  return prepareArtifactTrack(
    {
      ...located,
      pins: located.pins.filter((pin) => !pin.storyboardHidden),
      unplacedPhotos: [],
    },
    trimMeters,
  );
}

/** Build a detached export snapshot before embedding any track data. */
export function prepareArtifactTrack(
  track: HikeTrack,
  trimMeters: number,
): HikeTrack {
  if (
    !track.points.length &&
    !track.timedSession &&
    !track.pins.some((pin) => embeddedPhoto(pin.photoDataUrl))
  )
    throw new Error("Choose a track with GPS points to create an artifact.");
  if (!Number.isFinite(trimMeters) || trimMeters < 0)
    throw new Error("Invalid privacy trim distance.");
  const privacy = trimMeters > 0;
  const points = applyPrivacyTrim(track.points, trimMeters);
  // The domain helper preserves short tracks. An export must not silently expose them.
  if (privacy && (points.length < 2 || points.length === track.points.length)) {
    throw new Error(
      "This track is too short for the requested privacy trim. Reduce the trim distance or choose a longer track.",
    );
  }
  const start = points[0]?.cumDistKm ?? 0;
  const end = points[points.length - 1]?.cumDistKm ?? 0;
  return {
    id: privacy ? "private-field-log" : track.id,
    name: track.name,
    region: track.region,
    createdAt: privacy ? 0 : track.createdAt,
    source: track.source,
    timedSession: track.timedSession,
    freeRoam: track.freeRoam,
    // Unplaced photos cannot be checked against endpoint privacy zones.
    unplacedPhotos: privacy
      ? []
      : (track.unplacedPhotos ?? [])
          .map((photo) => ({
            id: photo.id,
            caption: photo.caption,
            timestamp: photo.timestamp,
            photoDataUrl: embeddedPhoto(photo.photoDataUrl) ?? "",
          }))
          .filter((photo) => photo.photoDataUrl),
    elevationEstimated: track.elevationEstimated,
    points: points.map((point) => ({
      lat: point.lat,
      lng: point.lng,
      ele: point.ele,
      cumDistKm: point.cumDistKm,
      gradePct: point.gradePct,
      ...(!privacy && point.time !== undefined ? { time: point.time } : {}),
      ...(!privacy && point.wallTime !== undefined
        ? { wallTime: point.wallTime }
        : {}),
    })),
    pins: track.pins
      .filter(
        (pin) => !privacy || (pin.cumDistKm >= start && pin.cumDistKm <= end),
      )
      .map((pin, index) => ({
        id: privacy ? `pin-${index}` : pin.id,
        lat: pin.lat,
        lng: pin.lng,
        ele: pin.ele,
        cumDistKm: pin.cumDistKm,
        timestamp: privacy ? 0 : pin.timestamp,
        ...(!privacy && pin.timeSource ? { timeSource: pin.timeSource } : {}),
        caption: pin.caption,
        photoDataUrl: embeddedPhoto(pin.photoDataUrl),
        exifSource: pin.exifSource,
        offTrail: pin.offTrail,
      })),
    stats: {
      ...track.stats,
      durationSec: privacy ? null : track.stats.durationSec,
    },
    privacyTrimmed: privacy || track.privacyTrimmed,
  };
}
