import { createCalmSync, type OutboxSnapshot, type SyncHeader, syncHeader } from "@perch/ui-logic";
import { useSyncExternalStore } from "react";
import { browserTimers } from "../adapters/browser.ts";
import { useDeps } from "../app/AppProvider.tsx";
import type { AppDeps } from "../app/deps.ts";

/** The outbox queue as React state; same object until something changes. */
export function useOutboxSnapshot(): OutboxSnapshot {
  const { outbox } = useDeps();
  return useSyncExternalStore(outbox.subscribe, outbox.getSnapshot);
}

const rawHeader = (deps: Pick<AppDeps, "auth" | "outbox">): SyncHeader =>
  deps.auth.signedOut() ? { kind: "signed_out" } : syncHeader(deps.outbox.getSnapshot());

/** What the sync status says. Reads count as signed out too (a 401 on the list). */
export function useSyncHeader(): SyncHeader {
  const { auth } = useDeps();
  const snapshot = useOutboxSnapshot();
  const readsOut = useSyncExternalStore(auth.subscribe, auth.signedOut);
  return readsOut ? { kind: "signed_out" } : syncHeader(snapshot);
}

type CalmSync = ReturnType<typeof createCalmSync>;
/** One calm label per app, so every place that shows it agrees and a remount keeps its timing. */
const calmStores = new WeakMap<AppDeps["outbox"], CalmSync>();

function calmFor(deps: AppDeps): CalmSync {
  let calm = calmStores.get(deps.outbox);
  if (calm === undefined) {
    calm = createCalmSync({
      read: () => rawHeader(deps),
      subscribe: (listener) => {
        const offOutbox = deps.outbox.subscribe(listener);
        const offAuth = deps.auth.subscribe(listener);
        return () => {
          offOutbox();
          offAuth();
        };
      },
      timers: browserTimers,
      now: () => Date.now(),
    });
    calmStores.set(deps.outbox, calm);
  }
  return calm;
}

/**
 * The sync status for display only: short passes and quick swaps are smoothed
 * (see calmStep). It never says All synced while writes wait. Decisions read
 * useSyncHeader or the snapshot, never this.
 */
export function useCalmSyncHeader(): SyncHeader {
  const calm = calmFor(useDeps());
  return useSyncExternalStore(calm.subscribe, calm.get);
}
