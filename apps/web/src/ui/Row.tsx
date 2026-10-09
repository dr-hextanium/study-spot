import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** A list row: lead, title with an optional sub line, and an end slot. A link, a button or a plain line. */
export function Row(props: {
  title: string;
  sub?: ReactNode;
  lead?: ReactNode;
  end?: ReactNode;
  link?: LinkProps;
  onClick?: () => void;
  compact?: boolean;
  /** A choice in a list: exposes the selected state to assistive tech. */
  pressed?: boolean;
}) {
  const className = `row${props.compact === true ? " row--compact" : ""}`;
  const body = (
    <>
      {props.lead}
      <span className="row__text">
        <span className="row__title truncate">{props.title}</span>
        {props.sub === undefined ? null : <span className="row__sub truncate">{props.sub}</span>}
      </span>
      {props.end === undefined ? null : <span className="row__end">{props.end}</span>}
    </>
  );
  return (
    <li className="row-item">
      {props.link !== undefined ? (
        <Link {...props.link} className={className}>
          {body}
        </Link>
      ) : props.onClick !== undefined ? (
        <button
          type="button"
          className={className}
          onClick={props.onClick}
          {...(props.pressed === undefined ? {} : { "aria-pressed": props.pressed })}
        >
          {body}
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}
    </li>
  );
}
