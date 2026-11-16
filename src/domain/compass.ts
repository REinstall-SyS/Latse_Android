/** A finite magnetic heading always wraps into [0, 359]. */
export function normalizeCompassHeading(rawHeading: number): number | null {
  return Number.isFinite(rawHeading)
    ? ((Math.round(rawHeading) % 360) + 360) % 360
    : null;
}
