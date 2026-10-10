import type { Ids, Liveness, Lock } from "@perch/ui-logic";

/** The part of the Web Locks API the outbox needs; navigator.locks satisfies it. */
export type LockApi = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
  query(): Promise<{ held?: { name?: string }[] }>;
};

/** Cross-tab mutual exclusion: tabs of one origin share these locks. */
export function createWebLock(locks: LockApi): Lock {
  return {
    run<T>(name: string, fn: () => Promise<T>): Promise<T> {
      return locks.request(name, () => fn());
    },
  };
}

// Web Lock name. Keeps the old project name on purpose: tabs on the old and new build must see each other.
export const TAB_LOCK_PREFIX = "study-spot:tab:";

/**
 * Each tab holds a Web Lock named after its owner id for as long as it runs.
 * The browser drops it when the tab closes or crashes, so another tab sees at
 * once that a write marked `syncing` by that tab will never settle.
 */
export function createWebLiveness(locks: LockApi, ids: Ids): Liveness {
  const self = ids.uuid();
  let release: (() => void) | null = null;
  let held: Promise<void> | null = null;
  let released = false;
  return {
    hold() {
      if (held === null) {
        released = false;
        const attempt = new Promise<void>((resolve, reject) => {
          locks
            .request(
              `${TAB_LOCK_PREFIX}${self}`,
              () =>
                new Promise<void>((done) => {
                  if (released) done();
                  else release = done;
                  resolve();
                }),
            )
            .catch((error: unknown) => {
              if (held === attempt) held = null;
              reject(error instanceof Error ? error : new Error(String(error)));
            });
        });
        held = attempt;
      }
      return held.then(() => self);
    },
    release() {
      released = true;
      release?.();
      release = null;
      held = null;
    },
    async alive(owner) {
      if (owner === self) return held !== null;
      const state = await locks.query();
      return (state.held ?? []).some((l) => l.name === `${TAB_LOCK_PREFIX}${owner}`);
    },
  };
}
