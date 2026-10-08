import { type RefCallback, useCallback, useEffect, useState } from "react";

/**
 * True once the element has come within 200 px of the screen, and it stays true.
 * Without IntersectionObserver the element counts as near.
 */
export function useNearViewport<T extends Element>(): { ref: RefCallback<T>; near: boolean } {
  const [node, setNode] = useState<T | null>(null);
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  const ref = useCallback((el: T | null) => setNode(el), []);
  useEffect(() => {
    if (near || node === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, near]);
  return { ref, near };
}
