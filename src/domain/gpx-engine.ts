import type { HikeTrack, SpatialPin, TrackPoint } from "@/types/trek.types";
import {
  calculatePaceMinPerKm,
  calculateVerticalRate,
} from "./altitude-physics";
import { haversineDistance } from "./geospatial";

const GRADE_WINDOW_KM = 0.05;
const ELEVATION_DEADBAND_M = 4;

function directChildText(parent: Element, name: string): string | undefined {
  const child = Array.from(parent.childNodes).find(
    (item) => item.nodeType === 1 && (item as Element).localName === name,
  );
  return child?.textContent?.trim() || undefined;
}

function elementsByName(parent: Document, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", name));
}

function finiteCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function parseTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function stableId(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  }
  return `gpx-${(hash >>> 0).toString(16)}`;
}

function lowerBoundDistance(points: TrackPoint[], targetKm: number): number {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle].cumDistKm < targetKm) low = middle + 1;
    else high = middle;
  }
  return low;
}

function smoothGrades(points: TrackPoint[]): void {
  for (let i = 0; i < points.length; i++) {
    const distance = points[i].cumDistKm;
    let left = Math.max(
      0,
      lowerBoundDistance(points, distance - GRADE_WINDOW_KM / 2) - 1,
    );
    let right = Math.min(
      points.length - 1,
      lowerBoundDistance(points, distance + GRADE_WINDOW_KM / 2),
    );

    if (points[right].cumDistKm - points[left].cumDistKm < GRADE_WINDOW_KM) {
      right = Math.min(
        points.length - 1,
        Math.max(
          right,
          lowerBoundDistance(points, points[left].cumDistKm + GRADE_WINDOW_KM),
        ),
      );
    }
    if (points[right].cumDistKm - points[left].cumDistKm < GRADE_WINDOW_KM) {
      left = Math.min(
        left,
        Math.max(
          0,
          lowerBoundDistance(
            points,
            points[right].cumDistKm - GRADE_WINDOW_KM,
          ) - 1,
        ),
      );
    }

    const horizontalM =
      (points[right].cumDistKm - points[left].cumDistKm) * 1000;
    points[i].gradePct =
      horizontalM >= 50
        ? Math.max(
            -50,
            Math.min(
              50,
              ((points[right].ele - points[left].ele) / horizontalM) * 100,
            ),
          )
        : 0;
  }
}

/** Counts completed rises and falls, ignoring reversals smaller than 4 m. */
function elevationChange(points: TrackPoint[]): { gain: number; loss: number } {
  if (points.length < 2) return { gain: 0, loss: 0 };

  let anchor = points[0].ele;
  let extreme = anchor;
  let direction = 0;
  let gain = 0;
  let loss = 0;

  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    const elevation = point.ele;
    if (direction === 0) {
      if (Math.abs(elevation - anchor) >= ELEVATION_DEADBAND_M) {
        direction = Math.sign(elevation - anchor);
        extreme = elevation;
      }
    } else if (direction > 0) {
      if (elevation > extreme) extreme = elevation;
      else if (extreme - elevation >= ELEVATION_DEADBAND_M) {
        gain += extreme - anchor;
        anchor = extreme;
        extreme = elevation;
        direction = -1;
      }
    } else if (elevation < extreme) {
      extreme = elevation;
    } else if (elevation - extreme >= ELEVATION_DEADBAND_M) {
      loss += anchor - extreme;
      anchor = extreme;
      extreme = elevation;
      direction = 1;
    }
  }

  if (direction > 0) gain += extreme - anchor;
  else if (direction < 0) loss += anchor - extreme;
  return { gain, loss };
}

/** Parse GPX track points, or route points when no track points exist. */
export function parseGPX(
  xmlString: string,
  fallbackName = "Imported GPX Track",
): HikeTrack {
  const document = new DOMParser().parseFromString(xmlString, "text/xml");
  if (
    document.documentElement?.localName !== "gpx" ||
    elementsByName(document, "parsererror").length
  ) {
    throw new Error("Invalid GPX XML");
  }

  const sourcePoints = elementsByName(document, "trkpt");
  const pointElements = sourcePoints.length
    ? sourcePoints
    : elementsByName(document, "rtept");
  if (!pointElements.length)
    throw new Error("GPX has no track or route points");

  const points: TrackPoint[] = [];
  for (const element of pointElements) {
    const latValue = element.getAttribute("lat");
    const lngValue = element.getAttribute("lon");
    if (!latValue?.trim() || !lngValue?.trim()) {
      throw new Error("GPX contains missing coordinates");
    }
    const lat = Number(latValue);
    const lng = Number(lngValue);
    if (!finiteCoordinate(lat, lng))
      throw new Error("GPX contains invalid coordinates");
    const parsedEle = Number(directChildText(element, "ele") ?? 0);
    const time = parseTime(directChildText(element, "time"));
    const wallTime = parseTime(
      element.getElementsByTagNameNS("*", "wallTime")[0]?.textContent?.trim(),
    );
    const previous = points[points.length - 1];
    const cumDistKm = previous
      ? previous.cumDistKm +
        haversineDistance(previous.lat, previous.lng, lat, lng)
      : 0;
    points.push({
      lat,
      lng,
      ele: Number.isFinite(parsedEle) ? parsedEle : 0,
      ...(time === undefined ? {} : { time }),
      ...(wallTime === undefined ? {} : { wallTime }),
      cumDistKm,
      gradePct: 0,
    });
  }
  smoothGrades(points);

  const metadata = elementsByName(document, "metadata")[0];
  const elevationEstimated =
    !!metadata &&
    directChildText(metadata, "keywords")
      ?.split(",")
      .includes("latse:planned-route") === true;
  const container = elementsByName(
    document,
    sourcePoints.length ? "trk" : "rte",
  )[0];
  const name =
    (container && directChildText(container, "name")) ||
    (metadata && directChildText(metadata, "name")) ||
    fallbackName;
  const region =
    (metadata && directChildText(metadata, "desc")) || "Imported route";
  const timedPoints = points.filter((point) => point.time !== undefined);
  const firstTime = timedPoints[0]?.time;
  const lastTime = timedPoints[timedPoints.length - 1]?.time;
  const change = elevationChange(points);
  const durationSec =
    timedPoints.length >= 2 &&
    firstTime !== undefined &&
    lastTime !== undefined &&
    lastTime >= firstTime
      ? (lastTime - firstTime) / 1000
      : null;
  let maxAltitudeM = -Infinity;
  let minAltitudeM = Infinity;
  let maxGradePct = 0;
  for (const point of points) {
    maxAltitudeM = Math.max(maxAltitudeM, point.ele);
    minAltitudeM = Math.min(minAltitudeM, point.ele);
    maxGradePct = Math.max(maxGradePct, Math.abs(point.gradePct));
  }

  const pins: SpatialPin[] = elementsByName(document, "wpt").flatMap(
    (element, index) => {
      const latValue = element.getAttribute("lat");
      const lngValue = element.getAttribute("lon");
      if (!latValue?.trim() || !lngValue?.trim()) return [];
      const lat = Number(latValue);
      const lng = Number(lngValue);
      if (!finiteCoordinate(lat, lng)) return [];
      const snapped = snapToTrack(lat, lng, points).point;
      const elevation = Number(directChildText(element, "ele"));
      return [
        {
          id: `pin-${index}`,
          lat,
          lng,
          ele: Number.isFinite(elevation) ? elevation : snapped.ele,
          cumDistKm: snapped.cumDistKm,
          timestamp: parseTime(directChildText(element, "time")) ?? 0,
          caption:
            directChildText(element, "name") ||
            directChildText(element, "desc") ||
            "Field note",
          exifSource: "manual" as const,
        },
      ];
    },
  );

  return {
    id: stableId(xmlString),
    name,
    region,
    createdAt:
      parseTime(metadata && directChildText(metadata, "time")) ??
      firstTime ??
      0,
    source: elevationEstimated ? "planned" : "imported",
    ...(elevationEstimated ? { elevationEstimated: true } : {}),
    points,
    pins,
    stats: {
      totalDistKm: points[points.length - 1].cumDistKm,
      elevationGainM: change.gain,
      elevationLossM: change.loss,
      maxAltitudeM,
      minAltitudeM,
      maxGradePct,
      durationSec,
      verticalRateMh: calculateVerticalRate(change.gain, durationSec ?? 0),
      paceMinPerKm: calculatePaceMinPerKm(
        points[points.length - 1].cumDistKm,
        durationSec ?? 0,
      ),
    },
  };
}

/** Leave short tracks intact: a 500 m trim needs at least 1.5 km of trail. */
export function applyPrivacyTrim(
  points: TrackPoint[],
  trimMeters: number,
): TrackPoint[] {
  if (!points.length || !Number.isFinite(trimMeters) || trimMeters <= 0)
    return [...points];
  const trimKm = trimMeters / 1000;
  const totalKm = points[points.length - 1].cumDistKm;
  if (totalKm <= 3 * trimKm) return [...points];
  return points.filter(
    (point) => point.cumDistKm >= trimKm && point.cumDistKm <= totalKm - trimKm,
  );
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

/** Export GPX 1.1; privacy export removes endpoints, nearby pins, and all times. */
export function serializeGPX(track: HikeTrack, privacyTrimMeters = 0): string {
  const points = applyPrivacyTrim(track.points, privacyTrimMeters);
  const wasTrimmed = points.length < track.points.length;
  const totalDist = track.points[track.points.length - 1]?.cumDistKm ?? 0;
  const trimKm = privacyTrimMeters / 1000;
  const pins = wasTrimmed
    ? track.pins.filter(
        (pin) => pin.cumDistKm >= trimKm && pin.cumDistKm <= totalDist - trimKm,
      )
    : track.pins;
  const includeTimes = privacyTrimMeters <= 0;

  const waypointXml = pins.map((pin) =>
    [
      `  <wpt lat="${pin.lat}" lon="${pin.lng}">`,
      `    <ele>${pin.ele}</ele>`,
      ...(includeTimes && Number.isFinite(pin.timestamp) && pin.timestamp > 0
        ? [`    <time>${new Date(pin.timestamp).toISOString()}</time>`]
        : []),
      `    <name>${escapeXml(pin.caption)}</name>`,
      "  </wpt>",
    ].join("\n"),
  );
  const pointXml = points.map((point) =>
    [
      `    <trkpt lat="${point.lat}" lon="${point.lng}">`,
      `      <ele>${point.ele}</ele>`,
      ...(includeTimes &&
      point.time !== undefined &&
      Number.isFinite(point.time)
        ? [`      <time>${new Date(point.time).toISOString()}</time>`]
        : []),
      ...(includeTimes && Number.isFinite(point.wallTime)
        ? [
            `      <extensions><latse:wallTime>${new Date(point.wallTime!).toISOString()}</latse:wallTime></extensions>`,
          ]
        : []),
      "    </trkpt>",
    ].join("\n"),
  );

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Latse" xmlns="http://www.topografix.com/GPX/1/1" xmlns:latse="urn:latse:track:1">',
    ...(track.elevationEstimated
      ? [
          `  <metadata><desc>${escapeXml(track.region)}</desc><keywords>latse:planned-route</keywords></metadata>`,
        ]
      : []),
    ...waypointXml,
    "  <trk>",
    `    <name>${escapeXml(track.name)}</name>`,
    "    <trkseg>",
    ...pointXml,
    "    </trkseg>",
    "  </trk>",
    "</gpx>",
  ].join("\n");
}

export function snapToTrack(
  lat: number,
  lng: number,
  points: TrackPoint[],
): { point: TrackPoint; index: number; offTrackMeters: number } {
  if (!points.length) throw new Error("Cannot snap to an empty track");
  if (!finiteCoordinate(lat, lng)) throw new Error("Invalid coordinates");

  let index = 0;
  let closestKm = Infinity;
  points.forEach((point, candidate) => {
    const distanceKm = haversineDistance(lat, lng, point.lat, point.lng);
    if (distanceKm < closestKm) {
      closestKm = distanceKm;
      index = candidate;
    }
  });
  return { point: points[index], index, offTrackMeters: closestKm * 1000 };
}

/** Estimate the photo position using GPS wall time, respecting pauses and gaps. */
export function interpolateTrackByTime(
  timestampMs: number,
  points: TrackPoint[],
): TrackPoint | null {
  if (!Number.isFinite(timestampMs)) return null;
  // Interpolate only consecutive timed fixes across short continuous intervals.
  // A pause, missing fix or long outage breaks the timing evidence for that segment.
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1],
      b = points[index];
    const start = a.wallTime ?? a.time,
      end = b.wallTime ?? b.time;
    if (
      start === undefined ||
      end === undefined ||
      timestampMs <= start ||
      timestampMs >= end
    )
      continue;
    const gap = end - start;
    const activeGap =
      a.time !== undefined && b.time !== undefined ? b.time - a.time : gap;
    if (gap <= 300000 && activeGap >= 0 && Math.abs(gap - activeGap) <= 2000)
      return interpolateBetween(a, b, (timestampMs - start) / gap);
    // Only a nearby observed fix can support an estimate on either side of a gap.
    if (Math.min(timestampMs - start, end - timestampMs) > 60000) return null;
  }
  const timed = points.filter((point) =>
    Number.isFinite(point.wallTime ?? point.time),
  );
  if (!timed.length) return null;
  let start = Infinity;
  let end = -Infinity;
  for (const point of timed) {
    start = Math.min(start, (point.wallTime ?? point.time)!);
    end = Math.max(end, (point.wallTime ?? point.time)!);
  }
  if (timestampMs < start || timestampMs > end) return null;
  return timed.reduce((closest, point) =>
    Math.abs((point.wallTime ?? point.time)! - timestampMs) <
    Math.abs((closest.wallTime ?? closest.time)! - timestampMs)
      ? point
      : closest,
  );
}

export function interpolateBetween(
  a: TrackPoint,
  b: TrackPoint,
  fraction: number,
): TrackPoint {
  const blend = (first: number, second: number) =>
    first + (second - first) * fraction;
  const longitudeDelta = b.lng - a.lng;
  // Longitude wraps at ±180°; a date-line crossing must follow the short arc.
  const lng =
    Math.abs(longitudeDelta) > 180
      ? ((a.lng +
          (longitudeDelta > 0 ? longitudeDelta - 360 : longitudeDelta + 360) *
            fraction +
          540) %
          360) -
        180
      : blend(a.lng, b.lng);
  return {
    lat: blend(a.lat, b.lat),
    lng,
    ele: blend(a.ele, b.ele),
    ...(a.time !== undefined && b.time !== undefined
      ? { time: blend(a.time, b.time) }
      : {}),
    ...(a.wallTime !== undefined && b.wallTime !== undefined
      ? { wallTime: blend(a.wallTime, b.wallTime) }
      : {}),
    cumDistKm: blend(a.cumDistKm, b.cumDistKm),
    gradePct: blend(a.gradePct, b.gradePct),
  };
}

/** Negative delta means the user reached this distance ahead of the ghost. */
export function calculateGhostDelta(
  userCumDistKm: number,
  elapsedSec: number,
  track: HikeTrack,
): { deltaSec: number | null; ghostPoint: TrackPoint | null } {
  const timed = track.points.filter(
    (point) => point.time !== undefined && Number.isFinite(point.time),
  );
  if (
    timed.length < 2 ||
    !Number.isFinite(userCumDistKm) ||
    !Number.isFinite(elapsedSec)
  ) {
    return { deltaSec: null, ghostPoint: null };
  }
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].time! < timed[i - 1].time!)
      return { deltaSec: null, ghostPoint: null };
  }
  const startTime = timed[0].time!;
  const targetTime = startTime + Math.max(0, elapsedSec) * 1000;
  let ghostPoint = timed[0];
  if (targetTime >= timed[timed.length - 1].time!) {
    ghostPoint = timed[timed.length - 1];
  } else {
    for (let i = 1; i < timed.length; i++) {
      const previous = timed[i - 1];
      const current = timed[i];
      if (targetTime <= current.time!) {
        const span = current.time! - previous.time!;
        ghostPoint =
          span > 0
            ? interpolateBetween(
                previous,
                current,
                Math.max(0, (targetTime - previous.time!) / span),
              )
            : current;
        break;
      }
    }
  }

  const distance = Math.max(
    timed[0].cumDistKm,
    Math.min(userCumDistKm, timed[timed.length - 1].cumDistKm),
  );
  let ghostArrivalTime = timed[timed.length - 1].time!;
  if (distance <= timed[0].cumDistKm) ghostArrivalTime = startTime;
  else {
    for (let i = 1; i < timed.length; i++) {
      const previous = timed[i - 1];
      const current = timed[i];
      if (distance <= current.cumDistKm) {
        const span = current.cumDistKm - previous.cumDistKm;
        ghostArrivalTime =
          span > 0
            ? previous.time! +
              ((current.time! - previous.time!) *
                (distance - previous.cumDistKm)) /
                span
            : current.time!;
        break;
      }
    }
  }

  return {
    deltaSec: elapsedSec - (ghostArrivalTime - startTime) / 1000,
    ghostPoint,
  };
}
