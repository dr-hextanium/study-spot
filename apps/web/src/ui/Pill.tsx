import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";

/** A small status pill: mist by default, red tint for the one thing that needs a look. */
export function Pill(props: { tone?: "mist" | "red"; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={`pill pill--${props.tone ?? "mist"}`}>
      {props.icon === undefined ? null : <Icon icon={props.icon} size={13} />}
      {props.children}
    </span>
  );
}
