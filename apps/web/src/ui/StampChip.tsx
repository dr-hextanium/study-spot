import type { ReactNode } from "react";

export type StampTone = "ink" | "red" | "green" | "blue" | "amber";

/** A rubber-stamp status mark: outlined by default, filled for the state that matters most.
 * A filled amber chip uses the onWarning text color. */
export function StampChip(props: { tone: StampTone; filled?: boolean; children: ReactNode }) {
  return (
    <span className={`stamp stamp--${props.tone}${props.filled === true ? " stamp--filled" : ""}`}>
      {props.children}
    </span>
  );
}
