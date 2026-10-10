import { useEffect, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";

const TICK_MS = 60_000;

/**
 * The current time, corrected for a wrong phone clock. Re-renders every minute,
 * when the page becomes visible again, and when the bundle store changes.
 */
export function useCampusNow(): Date {
  const { bundle } = useDeps();
  const [now, setNow] = useState(() => bundle.now());
  useEffect(() => {
    const update = () => setNow(bundle.now());
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    const id = setInterval(update, TICK_MS);
    // A fresh network response can bring the clock skew: use the corrected time at once,
    // not up to a minute later.
    const unsubscribe = bundle.subscribe(update);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [bundle]);
  return now;
}
