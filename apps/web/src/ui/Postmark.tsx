import { useEffect, useRef, useState } from "react";

export type PostmarkState = "fresh" | "stale" | "never";

type Props = {
  state: PostmarkState;
  /** Short date inside the ring, e.g. "OCT 5"; empty for never. */
  date: string;
  /** Accessible text, e.g. "Checked Oct 5". */
  label: string;
};

/**
 * Verification as a postmark ring: solid when checked recently, dashed when
 * stale, struck through when never checked. When the date changes the ring
 * lands like a stamp (160 ms press; a 120 ms fade with reduced motion, in CSS).
 */
export function Postmark({ state, date, label }: Props) {
  const previous = useRef(date);
  const [stamping, setStamping] = useState(false);
  useEffect(() => {
    if (previous.current === date) return;
    previous.current = date;
    setStamping(true);
    const timer = setTimeout(() => setStamping(false), 200);
    return () => clearTimeout(timer);
  }, [date]);
  return (
    <span
      className={`postmark postmark--${state}${stamping ? " postmark--stamping" : ""}`}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle className="postmark__ring" cx="18" cy="18" r="16" />
        <circle className="postmark__inner" cx="18" cy="18" r="12.5" />
        {state === "never" ? (
          <line className="postmark__strike" x1="6" y1="30" x2="30" y2="6" />
        ) : null}
      </svg>
      {state === "never" ? null : <span className="postmark__date">{date}</span>}
    </span>
  );
}
