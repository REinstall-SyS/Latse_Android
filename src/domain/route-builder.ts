import type { HikeTrack, TrackPoint } from "@/types/trek.types";
import { parseGPX } from "./gpx-engine";
import { haversineDistance } from "./geospatial";

export interface QuickRouteStop {
  lat: number;
  lng: number;
  ele: number | null;
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
}

/** Recompute all statistics from coordinates rather than trusting a pasted stats object. */
export function trackFromRoutePoints(
  points: Array<Pick<TrackPoint, "lat" | "lng" | "ele" | "time" | "wallTime">>,
  name: string,
  region = "Shared trail",
): HikeTrack {
  if (points.length < 2 || points.length > 25000)
    throw new Error("A route needs 2–25,000 points.");
  if (
    points.some(
      (point) =>
        ![point.lat, point.lng, point.ele].every(Number.isFinite) ||
        Math.abs(point.lat) > 90 ||
        Math.abs(point.lng) > 180 ||
        point.ele < -12000 ||
        point.ele > 100000 ||
        (point.wallTime !== undefined &&
          (!Number.isFinite(point.wallTime) ||
            !Number.isFinite(new Date(point.wallTime).getTime()))) ||
        (point.time !== undefined &&
          (!Number.isFinite(point.time) ||
            !Number.isFinite(new Date(point.time).getTime()))),
    )
  ) {
    throw new Error(
      "The route contains an invalid coordinate, elevation, or timestamp.",
    );
  }
  const xml = `<gpx><metadata><desc>${escapeXml(region.slice(0, 160))}</desc></metadata><trk><name>${escapeXml(name.trim().slice(0, 160) || "My trail")}</name><trkseg>${points
    .map(
      (point) =>
        `<trkpt lat="${point.lat}" lon="${point.lng}"><ele>${point.ele}</ele>${point.time === undefined ? "" : `<time>${new Date(point.time).toISOString()}</time>`}</trkpt>`,
    )
    .join("")}</trkseg></trk></gpx>`;
  const parsed = parseGPX(xml);
  return {
    ...parsed,
    points: parsed.points.map((point, index) => ({
      ...point,
      ...(points[index].wallTime === undefined
        ? {}
        : { wallTime: points[index].wallTime }),
    })),
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
}

/** Resolve unknown heights between known stops; all-unknown routes remain explicitly estimated/flat. */
export function resolveStopElevations(stops: QuickRouteStop[]): number[] {
  return stops.map((stop, index) => {
    if (stop.ele !== null) return stop.ele;
    let left = index - 1;
    let right = index + 1;
    while (left >= 0 && stops[left].ele === null) left--;
    while (right < stops.length && stops[right].ele === null) right++;
    if (left < 0) return right < stops.length ? stops[right].ele! : 0;
    if (right >= stops.length) return stops[left].ele!;
    let whole = 0;
    let partial = 0;
    for (let i = left + 1; i <= right; i++) {
      whole += haversineDistance(
        stops[i - 1].lat,
        stops[i - 1].lng,
        stops[i].lat,
        stops[i].lng,
      );
      if (i <= index) partial = whole;
    }
    return (
      stops[left].ele! +
      (stops[right].ele! - stops[left].ele!) * (whole ? partial / whole : 0)
    );
  });
}

export function buildQuickRoute(
  stops: QuickRouteStop[],
  name = "My quick route",
): HikeTrack {
  if (stops.length < 3 || stops.length > 10)
    throw new Error("Tap 3–10 stops to make your route.");
  if (
    stops.some(
      (stop) =>
        !Number.isFinite(stop.lat) ||
        !Number.isFinite(stop.lng) ||
        Math.abs(stop.lat) > 90 ||
        Math.abs(stop.lng) > 180 ||
        (stop.ele !== null &&
          (!Number.isFinite(stop.ele) ||
            stop.ele < -12000 ||
            stop.ele > 100000)),
    )
  ) {
    throw new Error(
      "Each stop needs valid coordinates and an optional elevation.",
    );
  }
  const heights = resolveStopElevations(stops);
  const points: Array<Pick<TrackPoint, "lat" | "lng" | "ele">> = [];
  for (let index = 1; index < stops.length; index++) {
    const a = stops[index - 1],
      b = stops[index];
    const distance = haversineDistance(a.lat, a.lng, b.lat, b.lng);
    const segments = Math.min(2000, Math.max(1, Math.ceil(distance / 0.05)));
    const longitudeDelta = ((b.lng - a.lng + 540) % 360) - 180;
    for (let step = index === 1 ? 0 : 1; step <= segments; step++) {
      const fraction = step / segments;
      points.push({
        lat: a.lat + (b.lat - a.lat) * fraction,
        lng: ((a.lng + longitudeDelta * fraction + 540) % 360) - 180,
        ele:
          heights[index - 1] + (heights[index] - heights[index - 1]) * fraction,
      });
    }
  }
  const track = trackFromRoutePoints(
    points,
    name,
    "Quick route · straight-line plan",
  );
  if (track.stats.totalDistKm < 0.01)
    throw new Error(
      "Spread your stops out to make a route at least 10 m long.",
    );
  return { ...track, source: "planned", elevationEstimated: true };
}
