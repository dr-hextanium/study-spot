import type { ReactNode } from "react";

/**
 * The sheet of card stock under the header band. `action` is pinned 16 px above
 * the home indicator, within thumb reach, and the content scrolls clear of it.
 */
export function Screen(props: { children: ReactNode; action?: ReactNode }) {
  return (
    <>
      <main
        tabIndex={-1}
        className={`screen${props.action === undefined ? "" : " screen--with-action"}`}
      >
        {props.children}
      </main>
      {props.action === undefined ? null : <div className="pinned">{props.action}</div>}
    </>
  );
}

/** A small-caps group heading over ruled rows. */
export function GroupHeading(props: { children: ReactNode; id?: string }) {
  return (
    <h2 className="group-heading" id={props.id}>
      {props.children}
    </h2>
  );
}
