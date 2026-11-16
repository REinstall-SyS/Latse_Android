import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type { LocationStatus } from "@/types/trek.types";

export interface LocationFix {
  lat: number;
  lng: number;
  altitude: number | null;
  accuracy: number;
  timestamp: number;
}

/**
 * Request location permissions via Capacitor (native) or web API.
 * Returns the resulting permission status.
 */
export async function requestLocationPermission(): Promise<LocationStatus> {
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await Geolocation.requestPermissions();
      const granted =
        perm.location === "granted" || perm.coarseLocation === "granted";
      return granted ? "granted" : "denied";
    } catch {
      // Fall through to web geolocation
    }
  }

  // Web fallback: check permissions API
  if (navigator.permissions) {
    try {
      const result = await navigator.permissions.query({ name: "geolocation" });
      if (result.state === "denied") return "denied";
    } catch {
      // Ignore — not all browsers support this
    }
  }

  return "requesting";
}

/**
 * Start watching GPS position. Returns a cleanup function.
 * The onFix callback receives each new GPS fix.
 * The onError callback is called if GPS fails.
 */
export function watchPosition(
  onFix: (fix: LocationFix) => void,
  onError: (status: LocationStatus) => void,
): () => void {
  if (Capacitor.isNativePlatform()) {
    let cancelled = false;
    let id: string | undefined;
    Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 20000, minimumUpdateInterval: 5000 },
      (position, error) => {
        if (cancelled) return;
        if (error || !position) {
          onError(
            error?.code === "OS-PLUG-GLOC-0003" ? "denied" : "unavailable",
          );
          return;
        }
        onFix({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          altitude: position.coords.altitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
    )
      .then((watchId) => {
        id = watchId;
        if (cancelled) void Geolocation.clearWatch({ id });
      })
      .catch(() => {
        if (!cancelled) onError("unavailable");
      });
    return () => {
      cancelled = true;
      if (id) void Geolocation.clearWatch({ id });
    };
  }
  if (!navigator.geolocation) {
    onError("unavailable");
    return () => {};
  }
  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        altitude:
          pos.coords.altitude !== null && pos.coords.altitude !== undefined
            ? Math.round(pos.coords.altitude)
            : null,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      });
    },
    (err) => {
      if (err.code === 1) onError("denied");
      else onError("unavailable");
    },
    { enableHighAccuracy: true, timeout: 20000 },
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}
