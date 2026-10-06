import type { ReactNode } from "react";

export type StampTone = "ink" | "red" | "green" | "blue" | "amber";

/** A rubber-stamp status mark: outlined by default, filled for the state that matters most.
 * Amber has no on-color token, so it is outline only. */
export function StampChip(
  props:
    | { tone: Exclude<StampTone, "amber">; filled?: boolean; children: ReactNode }
    | { tone: "amber"; filled?: false; children: ReactNode },
) {
  return (
    <span className={`stamp stamp--${props.tone}${props.filled === true ? " stamp--filled" : ""}`}>
      {props.children}
    </span>
  );
}
