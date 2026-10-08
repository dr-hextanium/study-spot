import { CircleAlert, type LucideIcon } from "lucide-react";
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
  // A danger banner always carries an icon, so a refusal never reads as a quiet note.
  const icon = props.icon ?? (tone === "danger" ? CircleAlert : undefined);
  return (
    // A refusal interrupts; a note waits to be read.
    <div className={`banner banner--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {icon === undefined ? null : <Icon icon={icon} className="banner__icon" />}
      <p className="banner__text">{props.children}</p>
      {props.action}
    </div>
  );
}
