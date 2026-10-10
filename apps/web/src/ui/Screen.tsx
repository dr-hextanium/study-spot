import type { LinkProps } from "@tanstack/react-router";
import { type ReactNode, useLayoutEffect, useRef } from "react";
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
  /** The h1 is for assistive tech only (a skeleton draws its shape instead). */
  titleHidden?: boolean;
  /**
   * A skeleton screen that the real one replaces with a new Screen (the section
   * editors): if its main has focus when it goes, the next Screen's main takes it.
   */
  busy?: boolean;
  children: ReactNode;
}) {
  const { ref, scrolled } = useLargeTitle();
  const main = useRef<HTMLElement>(null);
  const busy = props.busy === true;
  useFocusHandoff(main, busy);
  return (
    <>
      <TopBar
        title={props.title}
        {...(props.back === undefined ? {} : { back: props.back })}
        {...(props.trailing === undefined ? {} : { trailing: props.trailing })}
        scrolled={scrolled}
      />
      <main
        ref={main}
        tabIndex={-1}
        className={`screen screen--seawolf${props.action === undefined ? "" : " screen--with-bar"}`}
      >
        <div className="column">
          <h1 ref={ref} className={props.titleHidden === true ? "visually-hidden" : "large-title"}>
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

/** Set while a busy Screen's focused main is being replaced by the next Screen. */
let handoff = false;

/**
 * Focus survives a skeleton giving way to its screen. A busy Screen's cleanup runs
 * before its main leaves the page, so it can see that main has focus; the Screen
 * mounted in the same commit then focuses its own main, unless focus went elsewhere.
 */
function useFocusHandoff(main: { current: HTMLElement | null }, busy: boolean): void {
  useLayoutEffect(() => {
    const el = main.current;
    if (handoff && el !== null) {
      handoff = false;
      const active = document.activeElement;
      if (active === null || active === document.body) el.focus({ preventScroll: true });
    }
    return () => {
      if (busy && el !== null && document.activeElement === el) {
        handoff = true;
        // Only a Screen mounted in this same commit takes it.
        queueMicrotask(() => {
          handoff = false;
        });
      }
    };
  }, [main, busy]);
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
