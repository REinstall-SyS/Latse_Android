export interface TurnaroundPlan {
  latestTurnaroundMs: number;
  minutesAvailableOutbound: number;
  returnBeforeDark: boolean;
}

/** Budget daylight for the return leg and a configurable margin before sunset. */
export function calculateTurnaroundPlan(
  nowMs: number,
  daylightRemainingMin: number,
  returnMinutes: number,
  bufferMinutes = 30,
): TurnaroundPlan {
  const remaining = Math.max(0, daylightRemainingMin);
  const returnTime = Math.max(0, returnMinutes);
  const buffer = Math.max(0, bufferMinutes);
  const minutesAvailableOutbound = Math.max(0, remaining - returnTime - buffer);
  return {
    latestTurnaroundMs: nowMs + (remaining - returnTime - buffer) * 60000,
    minutesAvailableOutbound,
    returnBeforeDark: remaining >= returnTime + buffer,
  };
}
