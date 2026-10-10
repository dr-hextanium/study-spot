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
