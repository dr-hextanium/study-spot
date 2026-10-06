import type { ReactNode } from "react";

/** A line that needs the surveyor: a stamp-red rule above and below, the action on the right. */
export function Banner(props: {
  children: ReactNode;
  action?: ReactNode;
  tone?: "danger" | "note";
}) {
  return (
    <div className={`banner banner--${props.tone ?? "danger"}`} role="status">
      <p className="banner__text">{props.children}</p>
      {props.action}
    </div>
  );
}
