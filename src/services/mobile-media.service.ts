import {
  DEFAULT_PLACEMENT_CENTER,
  placePhotoAtCoordinate,
} from "@/domain/photo-placement";
import { formatElevation, type UnitSystem } from "@/domain/units";
import type { HikeTrack, SpatialPin, TrailPhoto } from "@/types/trek.types";
import {
  compressPhotoToDataUrl,
  extractPhotoMetadata,
  matchPhotoToTrack,
} from "@/domain/exif-matcher";

export type MobileMediaSource = "camera" | "gallery";
export const MAX_TRAIL_PHOTOS = 10;
const MAX_PHOTO_BYTES = 40 * 1024 * 1024;

/** Keep this synchronous so the phone picker retains the button's user activation. */
export function openMobileMediaPicker(
  input: HTMLInputElement,
  source: MobileMediaSource,
  multiple = true,
): void {
  input.type = "file";
  input.accept = "image/*";
  input.multiple = source === "gallery" && multiple;
  input.value = "";
  if (source === "camera") input.setAttribute("capture", "environment");
  else input.removeAttribute("capture");
  input.click();
}

export function validatePhotoSelection(
  files: File[],
  remaining = MAX_TRAIL_PHOTOS,
): void {
  if (files.length > remaining)
    throw new Error(
      `Choose up to ${Math.max(0, remaining)} more photos in this set.`,
    );
  for (const file of files) {
    if (!file.size) throw new Error(`${file.name || "This photo"} is empty.`);
    if (file.size > MAX_PHOTO_BYTES)
      throw new Error(
        `${file.name} is larger than 40 MB. Choose a smaller photo.`,
      );
    if (
      file.type
        ? !file.type.startsWith("image/")
        : !/\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name)
    ) {
      throw new Error(`${file.name || "This file"} is not a photo.`);
    }
  }
}

export function createPhotoPreview(file: File): {
  url: string;
  release: () => void;
} {
  const url = URL.createObjectURL(file);
  let released = false;
  return {
    url,
    release: () => {
      if (!released) {
        released = true;
        URL.revokeObjectURL(url);
      }
    },
  };
}

export async function readTrailPhoto(
  file: File,
  source: MobileMediaSource = "gallery",
): Promise<TrailPhoto> {
  const receivedAt = Date.now();
  validatePhotoSelection([file]);
  const [metadata, photoDataUrl] = await Promise.all([
    extractPhotoMetadata(file),
    compressPhotoToDataUrl(file, 800, 0.78),
  ]);
  const cameraEstimate =
    source === "camera" &&
    metadata.timeSource !== "exif" &&
    (!file.lastModified || Math.abs(file.lastModified - receivedAt) <= 120000);
  return {
    id: crypto.randomUUID(),
    caption: file.name.replace(/\.[^.]+$/, "").slice(0, 1500) || "Trail photo",
    photoDataUrl,
    timestamp: cameraEstimate
      ? file.lastModified || receivedAt
      : (metadata.timestamp ?? 0),
    timeSource: cameraEstimate ? "camera" : metadata.timeSource,
    ...(metadata.lat !== undefined && metadata.lng !== undefined
      ? { captureLocation: { lat: metadata.lat, lng: metadata.lng } }
      : {}),
  };
}

export function positionTrailPhoto(
  photo: TrailPhoto,
  track: HikeTrack,
  fallbackIndex?: number,
  liveCamera = false,
): SpatialPin {
  const match = matchPhotoToTrack(
    {
      ...photo.captureLocation,
      timestamp:
        photo.timeSource === "exif" || photo.timeSource === "camera"
          ? photo.timestamp
          : undefined,
    },
    track,
  );
  const last = track.points[track.points.length - 1];
  const fixTime = last.wallTime ?? last.time;
  if (
    match.exifSource === "manual" &&
    liveCamera &&
    (photo.timeSource === "camera" || photo.timeSource === "exif") &&
    !photo.captureLocation &&
    fixTime !== undefined &&
    Math.abs(photo.timestamp - fixTime) <= 60000
  )
    return {
      ...photo,
      lat: last.lat,
      lng: last.lng,
      ele: last.ele,
      cumDistKm: last.cumDistKm,
      exifSource: "live",
    };

  if (match.exifSource === "manual" && fallbackIndex !== undefined) {
    const point =
      track.points[
        Math.max(0, Math.min(track.points.length - 1, fallbackIndex))
      ];
    return {
      ...photo,
      lat: point.lat,
      lng: point.lng,
      ele: point.ele,
      cumDistKm: point.cumDistKm,
      exifSource: "manual",
      placementSource: "fallback",
    };
  }
  return {
    ...photo,
    ...match,
    ...(match.exifSource === "manual"
      ? { placementSource: "fallback" as const }
      : {}),
  };
}

export async function prepareTrailPhoto(
  file: File,
  track: HikeTrack,
  fallbackIndex?: number,
  source: MobileMediaSource = "gallery",
  liveRecording = false,
  placementCenter?: [number, number],
): Promise<SpatialPin> {
  const photo = await readTrailPhoto(file, source);
  if (track.freeRoam) {
    const base: SpatialPin = {
      ...photo,
      lat: 0,
      lng: 0,
      ele: 0,
      cumDistKm: 0,
      exifSource: "manual",
    };
    const at = photo.captureLocation
      ? [photo.captureLocation.lat, photo.captureLocation.lng]
      : (placementCenter ??
        (track.points.length
          ? [track.points[0].lat, track.points[0].lng]
          : DEFAULT_PLACEMENT_CENTER));
    return {
      ...placePhotoAtCoordinate(base, track, at[0], at[1]),
      exifSource: photo.captureLocation ? "gps" : "manual",
    };
  }
  return positionTrailPhoto(
    photo,
    track,
    fallbackIndex,
    liveRecording && source === "camera",
  );
}

export function photoMatchDescription(
  pin: SpatialPin,
  units: UnitSystem = "metric",
): string {
  const elevation = formatElevation(pin.ele, units);
  if (pin.exifSource === "live")
    return `Pinned to a recent recording fix · ${elevation}`;
  if (pin.exifSource === "gps")
    return `📍 Placed from photo GPS · ${elevation}`;
  if (pin.exifSource === "timestamp")
    return `🕒 Matched by time · ${elevation}`;
  return `✋ ${pin.offTrail ? "Placed off trail" : "Set on trail"} · ${elevation}`;
}
/** Compatibility for consumers of the original media helper. */
export const photoMatchLabel = photoMatchDescription;

export function movePinToPoint(
  pin: SpatialPin,
  track: HikeTrack,
  index: number,
): SpatialPin {
  const point =
    track.points[
      Math.max(0, Math.min(track.points.length - 1, Math.round(index)))
    ];
  if (!point) throw new Error("Choose a route before positioning a photo.");
  return {
    ...pin,
    lat: point.lat,
    lng: point.lng,
    ele: point.ele,
    cumDistKm: point.cumDistKm,
    exifSource: "manual",
  };
}
