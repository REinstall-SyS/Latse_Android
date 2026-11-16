import { useCallback, useEffect, useState } from "react";
import type {
  Telemetry,
  LocationStatus,
  BreadcrumbState,
} from "@/types/trek.types";
import { shouldAcceptGPSFix } from "@/domain/geospatial";
import {
  requestLocationPermission,
  watchPosition,
} from "@/services/location.service";
import { dateKey, safeGetItem, safeSetItem } from "@/services/storage.service";

/** Live GPS is route agnostic. Forecast requests belong to the Weather view. */
export function useTrekTelemetry(suspended = false) {
  const [telemetry, setTelemetry] = useState<Telemetry>({
    alt: null,
    distanceWalkedKm: "0.0",
  });
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null,
  );
  const [telemetryFixTimestamp, setTelemetryFixTimestamp] = useState(0);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [request, setRequest] = useState(0);
  const requestLocation = useCallback(() => {
    try {
      localStorage.setItem("latse_location_asked", "1");
    } catch {}
    setRequest((value) => value + 1);
  }, []);
  useEffect(() => {
    try {
      if (localStorage.getItem("latse_location_asked")) setRequest(1);
    } catch {}
  }, []);
  useEffect(() => {
    if (!request || suspended) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    setLocationStatus("requesting");
    requestLocationPermission()
      .then((permission) => {
        if (cancelled) return;
        if (permission === "denied") {
          setLocationStatus("denied");
          return;
        }
        stop = watchPosition(
          (fix) => {
            if (cancelled) return;
            setUserLocation([fix.lat, fix.lng]);
            setTelemetryFixTimestamp(fix.timestamp);
            setLocationStatus("granted");
            const key = dateKey("latse_breadcrumbs");
            const breadcrumbs = safeGetItem<BreadcrumbState>(key, {
              fixes: [],
              totalKm: 0,
            });
            const last = breadcrumbs.fixes[breadcrumbs.fixes.length - 1];
            const check = shouldAcceptGPSFix(
              fix.lat,
              fix.lng,
              last?.lat ?? null,
              last?.lng ?? null,
              fix.accuracy,
            );
            if (check.accept) {
              breadcrumbs.fixes.push({
                lat: fix.lat,
                lng: fix.lng,
                ts: fix.timestamp,
              });
              breadcrumbs.totalKm += check.distanceKm;
              safeSetItem(key, breadcrumbs);
            }
            setTelemetry((previous) => {
              const altitude = fix.altitude;
              return {
                ...previous,
                alt: altitude,
                distanceWalkedKm: breadcrumbs.totalKm.toFixed(1),
              };
            });
          },
          (status) => {
            if (!cancelled) setLocationStatus(status);
          },
        );
      })
      .catch(() => {
        if (!cancelled) setLocationStatus("unavailable");
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [request, suspended]);
  return {
    telemetry,
    telemetryFixTimestamp,
    userLocation,
    locationStatus,
    locationRequested: request > 0,
    requestLocation,
  };
}
