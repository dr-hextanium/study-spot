import type { Clock } from "../clock.ts";

export type RateLimiter = { allow(key: string): boolean };

/**
 * Fixed-window limiter held in memory only. The key (a client address) is never written
 * anywhere else, and the map is bounded so a flood of addresses cannot grow it.
 */
export function createRateLimiter(opts: {
  clock: Clock;
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const maxKeys = opts.maxKeys ?? 5000;
  const windows = new Map<string, { start: number; n: number }>();

  function makeRoom(now: number): void {
    for (const [k, w] of windows) if (now - w.start >= opts.windowMs) windows.delete(k);
    while (windows.size >= maxKeys) {
      const oldest = windows.keys().next();
      if (oldest.done) break;
      windows.delete(oldest.value);
    }
  }

  return {
    allow(key) {
      const now = opts.clock.now().getTime();
      const w = windows.get(key);
      if (w && now - w.start < opts.windowMs) {
        if (w.n >= opts.limit) return false;
        w.n += 1;
        return true;
      }
      windows.delete(key);
      if (windows.size >= maxKeys) makeRoom(now);
      windows.set(key, { start: now, n: 1 });
      return true;
    },
  };
}
