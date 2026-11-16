import type { DaylightStatus } from "@/types/trek.types";

/**
 * Calculate relative atmospheric oxygen partial pressure at altitude.
 * Formula: α(h) = exp(-h / 8400) where h = max(0, altitudeM)
 * Returns a barometric percentage (0–100), not blood SpO2.
 * FIX: Check altitude !== null && altitude !== undefined (don't treat 0 as falsy)
 */
export function calculateEffectiveO2(altitude: number | null): number {
  if (altitude === null || altitude === undefined) return 100;
  const h = Math.max(0, altitude);
  return Math.round(100 * Math.exp(-h / 8400));
}

/**
 * Relative atmospheric oxygen partial pressure (0 to 1)
 */
export function oxygenRatio(altitudeM: number): number {
  const h = Math.max(0, altitudeM);
  return Math.exp(-h / 8400);
}

/**
 * Pack Weight Penalty (0.5 to 1)
 */
export function packWeightPenalty(packWeightKg: number): number {
  return Math.max(0.5, 1 - 0.015 * Math.max(0, packWeightKg - 10));
}

/**
 * Feature A: Altitude-Adjusted Naismith's Rule
 *
 * Sea-level Naismith time (hours): T0 = distanceKm/5.0 + elevationGainM/600.0
 * Adjusted Alpine Time: T_alpine = T0 / (α(h) · β(w))
 */
export function calculateAlpineTime(
  distanceKm: number,
  elevationGainM: number,
  currentAltitudeM: number,
  packWeightKg: number,
): {
  seaLevelHours: number;
  alpineHours: number;
  slowdownPercent: number;
  oxygenRatio: number;
  weightPenalty: number;
} {
  const t0 = distanceKm / 5.0 + elevationGainM / 600.0;
  const alpha = oxygenRatio(currentAltitudeM);
  const beta = packWeightPenalty(packWeightKg);
  const tAlpine = t0 / (alpha * beta);
  const slowdown = t0 > 0 ? Math.round(((tAlpine - t0) / t0) * 100) : 0;

  return {
    seaLevelHours: t0,
    alpineHours: tAlpine,
    slowdownPercent: slowdown,
    oxygenRatio: alpha,
    weightPenalty: beta,
  };
}

/**
 * Feature B: Calculate daily hydration goal based on altitude.
 * < 2500m: 12 glasses (3.0L)
 * 2500m – 3999m: 15 glasses (3.75L)
 * >= 4000m: 18 glasses (4.5L)
 */
export function getHydrationGoal(altitudeM: number | null): {
  glasses: number;
  liters: number;
} {
  const alt = altitudeM !== null && altitudeM !== undefined ? altitudeM : 0;
  if (alt >= 4000) return { glasses: 18, liters: 4.5 };
  if (alt >= 2500) return { glasses: 15, liters: 3.75 };
  return { glasses: 12, liters: 3.0 };
}

/** Active ascent speed; missing, negative and zero-duration inputs have no rate. */
export function calculateVerticalRate(
  elevationGainM: number,
  durationSec: number,
): number {
  if (
    !Number.isFinite(elevationGainM) ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0
  )
    return 0;
  return Math.round((Math.max(0, elevationGainM) * 3600) / durationSec);
}

/** Round once in seconds so a pace such as 10:59.8 rolls over to 11:00. */
export function calculatePaceMinPerKm(
  distanceKm: number,
  durationSec: number,
): string {
  if (
    !Number.isFinite(distanceKm) ||
    !Number.isFinite(durationSec) ||
    distanceKm <= 0 ||
    durationSec <= 0
  ) {
    return "— /km";
  }
  const seconds = Math.round(durationSec / distanceKm);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} /km`;
}

/**
 * NOAA fractional-year solar declination/equation-of-time approximation.
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 * Uses the route's solar calendar day, not the device's date/time zone.
 * Refraction uses a 90.833 degree zenith. Terrain/horizon obstructions are not modeled.
 */
export function calculateDaylightRemaining(
  lat: number,
  lng: number,
  currentTimestampMs = Date.now(),
): DaylightStatus {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180 ||
    !Number.isFinite(currentTimestampMs) ||
    !Number.isFinite(new Date(currentTimestampMs).getTime())
  ) {
    throw new RangeError(
      "Daylight calculation requires valid coordinates and a timestamp.",
    );
  }
  const dayMs = 86400000;
  const solarDate = new Date(currentTimestampMs + lng * 240000);
  const year = solarDate.getUTCFullYear();
  const midnight = Date.UTC(
    year,
    solarDate.getUTCMonth(),
    solarDate.getUTCDate(),
  );
  const dayOfYear = Math.floor((midnight - Date.UTC(year, 0, 1)) / dayMs) + 1;
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / dayMs;
  const gamma = ((2 * Math.PI) / daysInYear) * (dayOfYear - 1);
  const equation =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const latitude = (lat * Math.PI) / 180;
  const cosine =
    (Math.cos((90.833 * Math.PI) / 180) -
      Math.sin(latitude) * Math.sin(declination)) /
    (Math.cos(latitude) * Math.cos(declination));
  if (cosine < -1) {
    return {
      sunsetTimeStr: "No sunset · polar day",
      daylightRemainingMin: 1440,
      isAfterSunset: false,
    };
  }
  if (cosine > 1) {
    return {
      sunsetTimeStr: "No sunrise · polar night",
      daylightRemainingMin: 0,
      isAfterSunset: true,
    };
  }
  const hourAngle =
    (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
  const solarNoon = 720 - 4 * lng - equation;
  const sunset = midnight + (solarNoon + 4 * hourAngle) * 60000;
  const sunrise = midnight + (solarNoon - 4 * hourAngle) * 60000;
  const isAfterSunset =
    currentTimestampMs >= sunset || currentTimestampMs < sunrise;
  const sunsetDate = new Date(sunset);
  const sunsetTimeStr = `${String(sunsetDate.getUTCHours()).padStart(2, "0")}:${String(sunsetDate.getUTCMinutes()).padStart(2, "0")} UTC`;
  return {
    sunsetTimeStr,
    daylightRemainingMin: isAfterSunset
      ? 0
      : Math.max(0, Math.floor((sunset - currentTimestampMs) / 60000)),
    isAfterSunset,
  };
}
