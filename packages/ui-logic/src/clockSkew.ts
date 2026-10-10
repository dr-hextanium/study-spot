/**
 * Stand-ins for `clockSkewMs` and `correctedNow` from `@perch/core`
 * (Phase A, Task A1, `campusTime.ts`). Same signatures and semantics. Once
 * Phase A is merged, delete this file and import them from `@perch/core`.
 */
const MAX_CLOCK_DRIFT_MS = 5 * 60_000;

/**
 * Server time minus device time, but only when the gap is past 5 minutes and
 * the server sent a parseable Date header. Smaller gaps are network latency.
 */
export function clockSkewMs(deviceAtResponse: Date, serverDate: string | null): number {
  if (serverDate === null) return 0;
  const server = Date.parse(serverDate);
  if (Number.isNaN(server)) return 0;
  const skew = server - deviceAtResponse.getTime();
  return Math.abs(skew) > MAX_CLOCK_DRIFT_MS ? skew : 0;
}

export function correctedNow(device: Date, skewMs: number): Date {
  return new Date(device.getTime() + skewMs);
}
