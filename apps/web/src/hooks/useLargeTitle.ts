import { type RefCallback, useCallback, useEffect, useRef, useState } from "react";

/**
 * True once the large title has scrolled under the top bar, so the bar can show
 * its small title. Without IntersectionObserver the bar title just stays hidden.
 */
export function useLargeTitle(): { ref: RefCallback<HTMLElement>; scrolled: boolean } {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const ref = useCallback<RefCallback<HTMLElement>>((node) => setEl(node), []);
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (el === null || typeof IntersectionObserver !== "function") return;
    observer.current = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last !== undefined) setScrolled(!last.isIntersecting);
      },
      { rootMargin: "-52px 0px 0px 0px", threshold: 0 },
    );
    observer.current.observe(el);
    return () => observer.current?.disconnect();
  }, [el]);
  return { ref, scrolled };
}
