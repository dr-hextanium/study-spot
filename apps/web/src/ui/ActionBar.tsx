import type { ReactNode } from "react";

/** The pinned bottom bar: at most one red button, within thumb reach. */
export function ActionBar(props: { children: ReactNode; stacked?: boolean }) {
  return (
    <footer className={`actionbar${props.stacked === true ? " actionbar--stacked" : ""}`}>
      <div className="actionbar__inner">{props.children}</div>
    </footer>
  );
}
