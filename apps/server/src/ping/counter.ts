import type { Clock } from "../clock.ts";
import type { Timers } from "../publish/publisher.ts";

/** Flush this long after the last ping, before Render's 15-minute sleep. */
export const PING_IDLE_MS = 600_000;
/** Flush at most this long after the first unflushed ping. */
export const PING_MAX_AGE_MS = 3_600_000;
export const PING_MAX_KEYS = 500;
/** While the database is down, keep at most this many keys; the oldest go first. */
export const PING_MAX_RETAINED_KEYS = 2000;

/** One aggregate: picks of a spot in one UTC hour. Never carries anything about a requester. */
export type PingRow = { spot_id: string; at: string; count: number };

export type PingCounter = {
  add(spotId: string): void;
  flushNow(): Promise<void>;
  pending(): number;
  close(): Promise<void>;
};

export type PingCounterDeps = {
  clock: Clock;
  timers: Timers;
  flush(rows: PingRow[]): Promise<void>;
  idleMs?: number;
  maxAgeMs?: number;
  maxKeys?: number;
  maxRetainedKeys?: number;
  log?: (message: string) => void;
};

const HOUR_MS = 3_600_000;

/**
 * Counts picks in memory only, keyed by spot and UTC hour. Nothing per ping is stored or
 * logged. Flushes when pings go idle, when the oldest unflushed ping is an hour old, when
 * the map is full, and on close, so each flush wakes the database at most once.
 */
export function createPingCounter(deps: PingCounterDeps): PingCounter {
  const idleMs = deps.idleMs ?? PING_IDLE_MS;
  const maxAgeMs = deps.maxAgeMs ?? PING_MAX_AGE_MS;
  const maxKeys = deps.maxKeys ?? PING_MAX_KEYS;
  const maxRetained = deps.maxRetainedKeys ?? PING_MAX_RETAINED_KEYS;
  const log = deps.log ?? (() => {});
  type Entry = { spot_id: string; at: string; count: number };
  let counts = new Map<string, Entry>();
  // Set by a failed flush: key-count flushes wait for the idle timer instead of retrying per ping.
  let backingOff = false;
  let cancelIdle: (() => void) | null = null;
  let cancelMaxAge: (() => void) | null = null;

  function cancelTimers(): void {
    cancelIdle?.();
    cancelMaxAge?.();
    cancelIdle = null;
    cancelMaxAge = null;
  }

  function armIdle(): void {
    cancelIdle?.();
    cancelIdle = deps.timers.after(idleMs, () => void flushNow());
  }

  function merge(spotId: string, at: string, count: number): void {
    const key = `${spotId}|${at}`;
    const row = counts.get(key);
    if (row) row.count += count;
    else counts.set(key, { spot_id: spotId, at, count });
  }

  function trim(): void {
    while (counts.size > maxRetained) {
      const oldest = counts.keys().next();
      if (oldest.done) break;
      counts.delete(oldest.value);
    }
  }

  async function flushNow(): Promise<void> {
    cancelTimers();
    if (counts.size === 0) return;
    const rows = [...counts.values()].map((r) => ({ ...r }));
    counts = new Map();
    try {
      await deps.flush(rows);
      backingOff = false;
    } catch {
      // Keep the counts, oldest first, and try again when the idle timer fires. The error
      // body is never logged.
      const newer = counts;
      counts = new Map();
      for (const r of rows) merge(r.spot_id, r.at, r.count);
      for (const r of newer.values()) merge(r.spot_id, r.at, r.count);
      trim();
      backingOff = true;
      armIdle();
      log("pick flush failed");
    }
  }

  return {
    add(spotId) {
      const hour = Math.floor(deps.clock.now().getTime() / HOUR_MS) * HOUR_MS;
      const wasEmpty = counts.size === 0;
      merge(spotId, new Date(hour).toISOString(), 1);
      if (backingOff) trim();
      else if (counts.size >= maxKeys) {
        void flushNow();
        return;
      }
      if (wasEmpty && cancelMaxAge === null) {
        cancelMaxAge = deps.timers.after(maxAgeMs, () => void flushNow());
      }
      armIdle();
    },
    flushNow,
    pending: () => [...counts.values()].reduce((n, r) => n + r.count, 0),
    async close() {
      await flushNow();
      cancelTimers();
    },
  };
}
