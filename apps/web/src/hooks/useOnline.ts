import { useCallback, useSyncExternalStore } from "react";
import { useDeps } from "../app/AppProvider.tsx";

/** navigator.onLine as React state. A hint only: a phone can be "online" with no route to the API. */
export function useOnline(): boolean {
  const { network } = useDeps();
  const subscribe = useCallback((l: () => void) => network.subscribe(() => l()), [network]);
  const get = useCallback(() => network.online(), [network]);
  return useSyncExternalStore(subscribe, get);
}
