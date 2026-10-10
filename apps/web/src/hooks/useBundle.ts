import type { BundleState } from "@perch/ui-logic";
import { useEffect, useSyncExternalStore } from "react";
import { useDeps } from "../app/AppProvider.tsx";

/** The bundle store's state; the first mount starts it (cache first, then one revalidation). */
export function useBundle(): BundleState {
  const { bundle } = useDeps();
  useEffect(() => {
    void bundle.start();
  }, [bundle]);
  return useSyncExternalStore(bundle.subscribe, bundle.getSnapshot);
}
