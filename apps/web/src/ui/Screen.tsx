import type { LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useLargeTitle } from "../hooks/useLargeTitle.ts";
import { ActionBar } from "./ActionBar.tsx";
import { TopBar } from "./TopBar.tsx";

/**
 * A screen: the sticky bar, then the column with the one h1 (the large title),
 * `meta`, the children, and the pinned action bar. The document scrolls.
 */
export function Screen(props: {
  title: string;
  back?: LinkProps;
  trailing?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  /** Stack the action bar's buttons: a wide primary over a quiet one. */
  stacked?: boolean;
  children: ReactNode;
}) {
  const { ref, scrolled } = useLargeTitle();
  return (
    <>
      <TopBar
        title={props.title}
        {...(props.back === undefined ? {} : { back: props.back })}
        {...(props.trailing === undefined ? {} : { trailing: props.trailing })}
        scrolled={scrolled}
      />
      <main
        tabIndex={-1}
        className={`screen screen--seawolf${props.action === undefined ? "" : " screen--with-bar"}`}
      >
        <div className="column">
          <h1 ref={ref} className="large-title">
            {props.title}
          </h1>
          {props.meta}
          {props.children}
        </div>
      </main>
      {props.action === undefined ? null : (
        <ActionBar {...(props.stacked === undefined ? {} : { stacked: props.stacked })}>
          {props.action}
        </ActionBar>
      )}
    </>
  );
}

/** A one-line row of facts under the large title. */
export function Meta(props: { children: ReactNode }) {
  return <p className="meta">{props.children}</p>;
}

/** A Newsreader group heading over a list, with an optional count. */
export function GroupHeading(props: { children: ReactNode; id?: string; count?: number }) {
  return (
    <h2 className="group-heading" id={props.id}>
      {props.children}
      {props.count === undefined ? null : <span className="count">{props.count}</span>}
    </h2>
  );
}
