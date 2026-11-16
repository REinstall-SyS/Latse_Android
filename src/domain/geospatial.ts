/**
 * Haversine distance between two GPS coordinates in km.
 * FIX: Check for null/undefined/NaN explicitly instead of !lat1 (which treats 0 as falsy).
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (
    [lat1, lon1, lat2, lon2].some(
      (v) => v === null || v === undefined || Number.isNaN(v),
    )
  ) {
    return 0;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Compass bearing from point 1 to point 2 in degrees (0-360).
 */
export function compassBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Format decimal degrees to DMS string (e.g., 27°59'17"N).
 */
export function toDMS(decimal: number, isLat: boolean): string {
  const totalSeconds = Math.round(Math.abs(decimal) * 3600);
  const d = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const dir = isLat ? (decimal >= 0 ? "N" : "S") : decimal >= 0 ? "E" : "W";
  return `${d}°${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}"${dir}`;
}

/**
 * Format coordinates in both decimal and DMS.
 */
export function formatCoordinates(
  lat: number,
  lng: number,
): { decimal: string; dms: string } {
  return {
    decimal: `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? "E" : "W"}`,
    dms: `${toDMS(lat, true)} ${toDMS(lng, false)}`,
  };
}

/**
 * Find the nearest waypoint of given types from a list.
 */
export function findNearestWaypoint(
  lat: number,
  lng: number,
  waypoints: Array<{ lat: number; lng: number; type: string; name: string }>,
  types: string[],
): { name: string; distanceKm: number } | null {
  let nearest: { name: string; distanceKm: number } | null = null;
  for (const wp of waypoints) {
    if (!types.includes(wp.type)) continue;
    const dist = haversineDistance(lat, lng, wp.lat, wp.lng);
    if (!nearest || dist < nearest.distanceKm) {
      nearest = { name: wp.name, distanceKm: dist };
    }
  }
  return nearest;
}

/**
 * GPS jitter filter: accepts a new fix only if accuracy <= threshold
 * and distance from last accepted fix is within sensible bounds.
 * Returns true if the fix should be accepted for breadcrumb tracking.
 */
export function shouldAcceptGPSFix(
  newLat: number,
  newLng: number,
  lastLat: number | null,
  lastLng: number | null,
  accuracy: number,
  accuracyThreshold = 35,
): { accept: boolean; distanceKm: number } {
  if (accuracy > accuracyThreshold) {
    return { accept: false, distanceKm: 0 };
  }
  if (lastLat === null || lastLng === null) {
    return { accept: true, distanceKm: 0 };
  }
  const dist = haversineDistance(lastLat, lastLng, newLat, newLng);
  // Accept if >= 10m (filter stationary drift) and <= 5km (reject teleportation)
  const accept = dist >= 0.01 && dist <= 5.0;
  return { accept, distanceKm: dist };
}
export function shouldWarnGPSGap(
  previous: Parameters<typeof hasGPSGap>[0],
  next: Parameters<typeof hasGPSGap>[1],
  resumedFromPause: boolean,
): boolean {
  return !resumedFromPause && hasGPSGap(previous, next);
}
export function hasGPSGap(
  previous:
    | { lat: number; lng: number; wallTime?: number; time?: number }
    | undefined,
  next: { lat: number; lng: number; timestamp: number },
): boolean {
  const timestamp = previous?.wallTime ?? previous?.time;
  return (
    !!previous &&
    timestamp !== undefined &&
    next.timestamp - timestamp > 180000 &&
    haversineDistance(previous.lat, previous.lng, next.lat, next.lng) > 0.25
  );
}
