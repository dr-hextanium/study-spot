import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";

/** A line that needs the surveyor: a mist box with an icon, the text, and the action on the right. */
export function Banner(props: {
  children: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  tone?: "danger" | "note";
}) {
  const tone = props.tone ?? "danger";
  return (
    // A refusal interrupts; a note waits to be read.
    <div className={`banner banner--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {props.icon === undefined ? null : <Icon icon={props.icon} className="banner__icon" />}
      <p className="banner__text">{props.children}</p>
      {props.action}
    </div>
  );
}
