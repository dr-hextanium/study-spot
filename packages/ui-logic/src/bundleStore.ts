import type { Bundle } from "@perch/core";
import type { Foreground, NetworkStatus } from "./adapters.ts";
import {
  type BundleClientDeps,
  type BundleLoad,
  loadBundle,
  readLastGood,
} from "./bundleClient.ts";
import { correctedNow } from "./clockSkew.ts";

export type ReadyLoad = Extract<BundleLoad, { bundle: Bundle }>;
export type BundleState =
  | { phase: "loading" }
  | { phase: "ready"; load: ReadyLoad; refreshing: boolean; checkFailed: boolean }
  | { phase: "unavailable"; reason: "offline_no_cache" | "update_required" };
export type BundleStoreDeps = BundleClientDeps & { foreground: Foreground; network: NetworkStatus };
export const REVALIDATE_AFTER_MS = 5 * 60_000;

export type BundleStore = {
  getSnapshot(): BundleState;
  subscribe(listener: () => void): () => void;
  /** Idempotent: the cached bundle first, then one revalidation. */
  start(): Promise<void>;
  refresh(): Promise<void>;
  /** Device time corrected by the last network clock skew (0 until one arrives). */
  now(): Date;
  stop(): void;
};

export function createBundleStore(deps: BundleStoreDeps, baseUrl: string): BundleStore {
  let state: BundleState = { phase: "loading" };
  let skewMs = 0;
  let lastCheck = Number.NEGATIVE_INFINITY;
  let inflight: Promise<void> | null = null;
  let started: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const unsubscribers: (() => void)[] = [];
  const set = (next: BundleState): void => {
    state = next;
    for (const l of listeners) l();
  };

  function refresh(): Promise<void> {
    if (inflight !== null) return inflight;
    inflight = (async () => {
      if (state.phase === "ready") set({ ...state, refreshing: true });
      const load = await loadBundle(deps, baseUrl);
      lastCheck = deps.clock.now().getTime();
      if (load.status === "unavailable") {
        // A bundle already on screen beats an error message.
        if (state.phase === "ready") set({ ...state, refreshing: false, checkFailed: true });
        else set({ phase: "unavailable", reason: load.reason });
        return;
      }
      if (load.status === "fresh") skewMs = load.skewMs;
      set({ phase: "ready", load, refreshing: false, checkFailed: load.networkFailed });
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      started ??= (async () => {
        const cached = await readLastGood(deps, baseUrl);
        if (cached !== null && state.phase === "loading") {
          set({ phase: "ready", load: cached, refreshing: true, checkFailed: false });
        }
        unsubscribers.push(
          deps.foreground.subscribe(() => {
            if (deps.clock.now().getTime() - lastCheck > REVALIDATE_AFTER_MS) void refresh();
          }),
          deps.network.subscribe((online) => {
            if (online) void refresh();
          }),
        );
        await refresh();
      })();
      return started;
    },
    refresh,
    now: () => correctedNow(deps.clock.now(), skewMs),
    stop() {
      for (const u of unsubscribers.splice(0)) u();
    },
  };
}
