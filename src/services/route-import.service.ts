import type { HikeTrack, SpatialPin, TrackPoint } from "@/types/trek.types";
import { parseGPX, snapToTrack } from "@/domain/gpx-engine";
import { trackFromRoutePoints } from "@/domain/route-builder";

const MAX_ROUTE_CHARACTERS = 4 * 1024 * 1024;
const CODE_PREFIX = "LATSE1:";

function encodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeUtf8(value: string): string {
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
  } catch {
    throw new Error("This Latse route code is damaged or incomplete.");
  }
}

/** Route-only exchange format: photos remain on the device and are never put into links. */
export function encodeLatseRoute(track: HikeTrack): string {
  if (track.points.length < 2 || track.points.length > 25000)
    throw new Error(
      "A route code needs 2–25,000 points. Use a GPX file for larger routes.",
    );
  const json = JSON.stringify({
    version: 1,
    name: track.name,
    region: track.region,
    elevationEstimated: track.elevationEstimated,
    points: track.points.map((point) => ({
      lat: point.lat,
      lng: point.lng,
      ele: point.ele,
      ...(point.time === undefined ? {} : { time: point.time }),
      ...(point.wallTime === undefined ? {} : { wallTime: point.wallTime }),
    })),
    pins: track.pins.map((pin) => ({
      lat: pin.lat,
      lng: pin.lng,
      ele: pin.ele,
      caption: pin.caption,
      timestamp: pin.timestamp,
    })),
  });
  const code = CODE_PREFIX + encodeUtf8(json);
  if (code.length > MAX_ROUTE_CHARACTERS)
    throw new Error(
      "This route is too large for a route code. Use a GPX file instead.",
    );
  return code;
}

export function latseRouteLink(track: HikeTrack): string {
  return `latse://route?data=${encodeLatseRoute(track)}`;
}

function importRouteJSON(value: unknown): HikeTrack {
  if (!value || typeof value !== "object")
    throw new Error("Paste a route object with a points array.");
  const object = value as Record<string, unknown>;
  if (object.version !== undefined && object.version !== 1)
    throw new Error("This route-code version is not supported.");
  if (!Array.isArray(object.points))
    throw new Error("Route JSON needs a points array with lat, lng, and ele.");
  if (object.points.length < 2 || object.points.length > 25000)
    throw new Error("A route needs 2–25,000 points.");
  const points = object.points.map((point: unknown) => {
    if (!point || typeof point !== "object")
      throw new Error("The route contains an invalid point.");
    const p = point as Record<string, unknown>;
    if (
      typeof p.lat !== "number" ||
      typeof p.lng !== "number" ||
      (p.ele !== undefined && typeof p.ele !== "number") ||
      (p.time !== undefined && typeof p.time !== "number") ||
      (p.wallTime !== undefined && typeof p.wallTime !== "number")
    )
      throw new Error("Route coordinates and times must be numbers.");
    return {
      lat: p.lat,
      lng: p.lng,
      ele: p.ele ?? 0,
      time: p.time,
      wallTime: p.wallTime,
    } as TrackPoint;
  });
  const track = trackFromRoutePoints(
    points,
    typeof object.name === "string" ? object.name : "Shared trail",
    typeof object.region === "string" ? object.region : "Shared trail",
  );
  if (Array.isArray(object.pins)) {
    track.pins = object.pins
      .slice(0, 1000)
      .flatMap((value: unknown): SpatialPin[] => {
        if (!value || typeof value !== "object") return [];
        const pin = value as Record<string, unknown>;
        if (
          typeof pin.lat !== "number" ||
          typeof pin.lng !== "number" ||
          !Number.isFinite(pin.lat) ||
          !Number.isFinite(pin.lng) ||
          Math.abs(pin.lat) > 90 ||
          Math.abs(pin.lng) > 180
        )
          return [];
        const point = snapToTrack(pin.lat, pin.lng, track.points).point;
        return [
          {
            id: crypto.randomUUID(),
            lat: point.lat,
            lng: point.lng,
            ele: point.ele,
            cumDistKm: point.cumDistKm,
            caption:
              typeof pin.caption === "string"
                ? pin.caption.slice(0, 1500)
                : "Field note",
            timestamp:
              typeof pin.timestamp === "number" &&
              Number.isFinite(new Date(pin.timestamp).getTime())
                ? pin.timestamp
                : 0,
            exifSource: "manual",
          },
        ];
      });
  }
  if (object.elevationEstimated === true) {
    track.elevationEstimated = true;
    track.source = "planned";
  }
  return track;
}

/** Decode embedded route data only; arbitrary Strava/Garmin web pages need their GPX export. */
export function parseTrailInput(
  input: string,
  fallbackName = "Imported trail",
): HikeTrack {
  if (input.length > MAX_ROUTE_CHARACTERS)
    throw new Error(
      "This route is too large. Choose a file smaller than 4 MB.",
    );
  let text = input.trim();
  if (!text)
    throw new Error("Paste a Latse link, route code, route JSON, or GPX text.");
  if (text.length > MAX_ROUTE_CHARACTERS)
    throw new Error(
      "This route is too large. Choose a file smaller than 4 MB.",
    );
  if (/^(https?:\/\/|latse:\/\/)/i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      throw new Error("This trail link is not valid.");
    }
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const embedded =
      url.searchParams.get("data") ||
      url.searchParams.get("route") ||
      hash.get("route") ||
      hash.get("data");
    if (!embedded)
      throw new Error(
        "This link has no Latse route data. Export a GPX from the route app and choose “Import from Garmin / Strava / Files”.",
      );
    text = embedded;
  }
  if (text.slice(0, CODE_PREFIX.length).toUpperCase() === CODE_PREFIX)
    text = decodeUtf8(text.slice(CODE_PREFIX.length));
  if (text.length > MAX_ROUTE_CHARACTERS)
    throw new Error("The decoded route is too large.");
  if (text.startsWith("<")) {
    const track = parseGPX(text, fallbackName);
    if (track.points.length < 2)
      throw new Error("A route needs at least two GPS points.");
    if (track.points.length > 25000)
      throw new Error("Choose a route with at most 25,000 points.");
    return { ...track, id: crypto.randomUUID(), createdAt: Date.now() };
  }
  try {
    return importRouteJSON(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error(
        "The pasted text is not valid GPX, route JSON, or a Latse code.",
      );
    throw error;
  }
}

export async function importRouteFile(file: File): Promise<HikeTrack> {
  if (file.size > MAX_ROUTE_CHARACTERS)
    throw new Error("Choose a route file smaller than 4 MB.");
  return parseTrailInput(await file.text(), file.name.replace(/\.[^.]+$/, ""));
}
