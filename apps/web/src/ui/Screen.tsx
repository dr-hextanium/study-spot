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
      {props.action === undefined ? null : <ActionBar>{props.action}</ActionBar>}
    </>
  );
}

/** A one-line row of facts under the large title. */
export function Meta(props: { children: ReactNode }) {
  return <p className="meta">{props.children}</p>;
}

/**
 * The old sheet of card stock under the header band. Screens move to `Screen`
 * one task at a time; Task 12 deletes this.
 */
export function LegacyScreen(props: { children: ReactNode; action?: ReactNode }) {
  return (
    <>
      <main
        tabIndex={-1}
        className={`screen${props.action === undefined ? "" : " screen--with-action"}`}
      >
        {props.children}
      </main>
      {props.action === undefined ? null : <footer className="pinned">{props.action}</footer>}
    </>
  );
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
