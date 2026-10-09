import type { LucideIcon } from "lucide-react";

/** A Lucide icon at the house stroke, hidden from assistive tech (the label lives on the control). */
export function Icon(props: { icon: LucideIcon; size?: number; className?: string }) {
  return (
    <props.icon
      aria-hidden="true"
      strokeWidth={1.75}
      size={props.size ?? 20}
      {...(props.className === undefined ? {} : { className: props.className })}
    />
  );
}
