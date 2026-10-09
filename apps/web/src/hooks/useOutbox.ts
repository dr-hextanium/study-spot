import { type OutboxSnapshot, type SyncHeader, syncHeader } from "@study-spot/ui-logic";
import { useSyncExternalStore } from "react";
import { useDeps } from "../app/AppProvider.tsx";

/** The outbox queue as React state; same object until something changes. */
export function useOutboxSnapshot(): OutboxSnapshot {
  const { outbox } = useDeps();
  return useSyncExternalStore(outbox.subscribe, outbox.getSnapshot);
}

/** What the sync status says. Reads count as signed out too (a 401 on the list). */
export function useSyncHeader(): SyncHeader {
  const { auth } = useDeps();
  const snapshot = useOutboxSnapshot();
  const readsOut = useSyncExternalStore(auth.subscribe, auth.signedOut);
  return readsOut ? { kind: "signed_out" } : syncHeader(snapshot);
}
