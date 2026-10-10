import { useEffect, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";

const TICK_MS = 60_000;

/**
 * The current time, corrected for a wrong phone clock. Re-renders every minute
 * and when the page becomes visible again.
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
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [bundle]);
  return now;
}
