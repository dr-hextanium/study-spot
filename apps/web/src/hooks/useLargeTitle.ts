import { type RefCallback, useCallback, useEffect, useState } from "react";

/** The sticky bar's real height (it includes the safe-area inset); 52 px when it is not mounted yet. */
function barHeight(): number {
  const bar = document.querySelector(".topbar");
  const h = bar === null ? 0 : bar.getBoundingClientRect().height;
  return h > 0 ? h : 52;
}

/**
 * True once the large title has scrolled under the top bar, so the bar can show
 * its small title. Without IntersectionObserver the bar title just stays hidden.
 * The margin is measured once when the title mounts, so a rotation that changes
 * the safe-area inset is approximate until the next screen.
 */
export function useLargeTitle(): { ref: RefCallback<HTMLElement>; scrolled: boolean } {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const ref = useCallback<RefCallback<HTMLElement>>((node) => setEl(node), []);
  useEffect(() => {
    if (el === null || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last !== undefined) setScrolled(!last.isIntersecting);
      },
      { rootMargin: `-${barHeight()}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return { ref, scrolled };
}
