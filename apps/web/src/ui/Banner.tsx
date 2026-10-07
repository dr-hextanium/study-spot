import type { ReactNode } from "react";

/** A line that needs the surveyor: a stamp-red rule above and below, the action on the right. */
export function Banner(props: {
  children: ReactNode;
  action?: ReactNode;
  tone?: "danger" | "note";
}) {
  const tone = props.tone ?? "danger";
  return (
    // A refusal interrupts; a note waits to be read.
    <div className={`banner banner--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <p className="banner__text">{props.children}</p>
      {props.action}
    </div>
  );
}
