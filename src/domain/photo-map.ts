import type { HikeTrack, SpatialPin, TrailPhoto } from "@/types/trek.types";
export function photoLocationPin(photo: TrailPhoto): SpatialPin | undefined {
  const at = photo.captureLocation;
  if (
    !at ||
    !Number.isFinite(at.lat) ||
    !Number.isFinite(at.lng) ||
    Math.abs(at.lat) > 90 ||
    Math.abs(at.lng) > 180
  )
    return;
  return {
    ...photo,
    lat: at.lat,
    lng: at.lng,
    ele: 0,
    cumDistKm: 0,
    exifSource: "gps",
    offTrail: true,
  };
}
/** A photo location is a pin, never an invented segment of a GPS recording. */
export function withLocatedPhotos(track: HikeTrack): HikeTrack {
  const known = new Set(track.pins.map((pin) => pin.id)),
    located = (track.unplacedPhotos ?? []).flatMap((photo) => {
      const pin = photoLocationPin(photo);
      return pin && !known.has(pin.id) ? [pin] : [];
    });
  if (!located.length) return track;
  const ids = new Set(located.map((pin) => pin.id));
  return {
    ...track,
    pins: [...track.pins, ...located],
    unplacedPhotos: track.unplacedPhotos?.filter((photo) => !ids.has(photo.id)),
  };
}
export function hasPhotoMap(track: HikeTrack): boolean {
  return (
    track.points.length > 0 ||
    withLocatedPhotos(track).pins.some(
      (pin) => !!pin.photoDataUrl && !pin.storyboardHidden,
    )
  );
}
