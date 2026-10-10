import type { BundleState, BundleStore } from "../src/bundleStore.ts";

/** A store frozen at one state, for screen tests. Nothing ever changes or loads. */
export function staticBundleStore(state: BundleState, now: () => Date): BundleStore {
  return {
    getSnapshot: () => state,
    subscribe: () => () => {},
    start: async () => {},
    refresh: async () => {},
    now,
    stop: () => {},
  };
}

/** A store whose state a test moves on (loading, then ready), telling subscribers each time. */
export function settableBundleStore(
  initial: BundleState,
  now: () => Date,
): BundleStore & { set(next: BundleState): void } {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: async () => {},
    refresh: async () => {},
    now,
    stop: () => {},
    set(next) {
      state = next;
      for (const l of listeners) l();
    },
  };
}
