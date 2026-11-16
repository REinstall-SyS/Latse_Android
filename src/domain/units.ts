export type UnitSystem = "imperial" | "metric";
export const MILES_PER_KM = 0.621371;
export const FEET_PER_METER = 3.28084;
const whole = (value: number) => Math.round(value).toLocaleString("en-US");
export function formatDistance(km: number, units: UnitSystem): string {
  return `${(km * (units === "imperial" ? MILES_PER_KM : 1)).toFixed(1)} ${units === "imperial" ? "mi" : "km"}`;
}
/** Endpoint privacy is horizontal distance, not elevation. */
export function formatPrivacyDistance(
  meters: number,
  units: UnitSystem,
): string {
  return formatDistance(meters / 1000, units);
}
export function formatElevation(
  meters: number,
  units: UnitSystem,
  signed = false,
): string {
  return `${signed && meters >= 0 ? "+" : ""}${whole(meters * (units === "imperial" ? FEET_PER_METER : 1))} ${units === "imperial" ? "ft" : "m"}`;
}
export function formatPace(paceMinPerKm: string, units: UnitSystem): string {
  const match = paceMinPerKm.match(/^(\d+):(\d{2})/);
  const suffix = units === "imperial" ? "/mi" : "/km";
  if (!match) return `— ${suffix}`;
  const seconds = Math.round(
    (Number(match[1]) * 60 + Number(match[2])) /
      (units === "imperial" ? MILES_PER_KM : 1),
  );
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} ${suffix}`;
}
export function formatVertRate(mh: number, units: UnitSystem): string {
  return `${whole(mh * (units === "imperial" ? FEET_PER_METER : 1))} ${units === "imperial" ? "ft/h" : "m/h"}`;
}
export function defaultUnits(
  language = typeof navigator === "undefined" ? "" : navigator.language,
): UnitSystem {
  return language === "en-US" ? "imperial" : "metric";
}
