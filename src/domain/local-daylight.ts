import { calculateDaylightRemaining } from "./altitude-physics";

/** Convert the solar UTC result into the device's explicitly labeled local clock. */
export function localSunset(
  lat: number,
  lng: number,
  now = Date.now(),
): string {
  const daylight = calculateDaylightRemaining(lat, lng, now);
  const clock = daylight.sunsetTimeStr.match(/^(\d{2}):(\d{2}) UTC$/);
  if (!clock)
    return daylight.sunsetTimeStr.includes("polar day")
      ? "No sunset"
      : "No sunrise";
  const date = new Date(now + lng * 240000);
  const midnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const utc = midnight + (+clock[1] * 60 + +clock[2]) * 60000;
  const expected = midnight + (1080 - 4 * lng) * 60000;
  const sunset = utc + Math.round((expected - utc) / 86400000) * 86400000;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(sunset);
}
