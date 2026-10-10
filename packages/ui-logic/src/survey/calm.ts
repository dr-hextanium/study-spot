import type { Timers } from "../adapters.ts";
import type { SyncHeader } from "./view.ts";

/** A pass must run this long before the label says Syncing; shorter ones read as waiting. */
export const SYNCING_SHOW_AFTER_MS = 400;
/** Once shown, Syncing or waiting stays at least this long before All synced. */
export const SYNCING_MIN_SHOWN_MS = 800;
/** Waiting and Syncing never swap faster than this. */
export const BUSY_SWAP_MIN_MS = 1000;

export type CalmState = {
  shown: SyncHeader;
  /** When `shown` last changed kind; a count change keeps it. */
  shownAt: number;
  /** When the raw header turned to syncing, while it stays so. */
  rawSyncingSince: number | null;
};

type Busy = Extract<SyncHeader, { kind: "syncing" | "pending" }>;
const isBusy = (h: SyncHeader): h is Busy => h.kind === "syncing" || h.kind === "pending";

/**
 * The sync label for display: the raw header with hysteresis, so short passes
 * and quick swaps do not flicker. It may lag the raw header, but only toward
 * busy: All synced shows only when the raw header says so, and trouble
 * (offline, failed, signed out, unreadable, checking) shows at once.
 * `recheckIn` is how soon to call again with the same raw header, or null.
 */
export function calmStep(
  prev: CalmState | null,
  raw: SyncHeader,
  now: number,
): { state: CalmState; recheckIn: number | null } {
  const rawSyncingSince = raw.kind === "syncing" ? (prev?.rawSyncingSince ?? now) : null;
  const waits: number[] = [];
  let target: SyncHeader = raw;
  if (raw.kind === "syncing" && prev?.shown.kind !== "syncing") {
    const left = rawSyncingSince === null ? 0 : rawSyncingSince + SYNCING_SHOW_AFTER_MS - now;
    if (left > 0) {
      target = { kind: "pending", count: raw.count };
      waits.push(left);
    }
  }
  let shown = target;
  let shownAt = now;
  if (prev !== null) {
    const was = prev.shown;
    if (was.kind === target.kind) {
      shownAt = prev.shownAt;
    } else if (isBusy(was) && (isBusy(target) || target.kind === "all_synced")) {
      const dwell = isBusy(target) ? BUSY_SWAP_MIN_MS : SYNCING_MIN_SHOWN_MS;
      const left = prev.shownAt + dwell - now;
      if (left > 0) {
        // Held: the kind stays, the count follows the queue while it has one.
        shown = isBusy(target) ? { kind: was.kind, count: target.count } : was;
        shownAt = prev.shownAt;
        waits.push(left);
      }
    }
  }
  return {
    state: { shown, shownAt, rawSyncingSince },
    recheckIn: waits.length === 0 ? null : Math.min(...waits),
  };
}

const same = (a: SyncHeader, b: SyncHeader): boolean =>
  a.kind === b.kind && ("count" in a ? a.count : null) === ("count" in b ? b.count : null);

/** A store of the calm label over a raw header source, rechecking on `timers`. */
export function createCalmSync(deps: {
  read: () => SyncHeader;
  subscribe: (listener: () => void) => () => void;
  timers: Timers;
  now: () => number;
}) {
  const listeners = new Set<() => void>();
  let cancel: (() => void) | null = null;
  const schedule = (recheckIn: number | null) => {
    cancel?.();
    cancel = recheckIn === null ? null : deps.timers.after(recheckIn, step);
  };
  const first = calmStep(null, deps.read(), deps.now());
  let state = first.state;
  function step(): void {
    const before = state.shown;
    const r = calmStep(state, deps.read(), deps.now());
    // Same object until the label changes, as useSyncExternalStore requires.
    state = same(before, r.state.shown) ? { ...r.state, shown: before } : r.state;
    schedule(r.recheckIn);
    if (state.shown !== before) for (const l of listeners) l();
  }
  schedule(first.recheckIn);
  const unsubscribe = deps.subscribe(step);
  return {
    get: (): SyncHeader => state.shown,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stop(): void {
      unsubscribe();
      schedule(null);
    },
  };
}
