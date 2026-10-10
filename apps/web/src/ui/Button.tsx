import { Link, type LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon.tsx";

export type ButtonVariant = "primary" | "ink" | "quiet" | "ghost" | "danger";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  /** Full width, for the action bar and sheet actions. */
  wide?: boolean;
  /** Takes the free width of the action bar. */
  grow?: boolean;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  children: ReactNode;
};

/** Red primary (one per screen), ink, mist quiet, text ghost, and red-filled danger for removals. */
export function Button({
  variant = "ink",
  wide = false,
  grow = false,
  icon,
  trailingIcon,
  children,
  ...rest
}: Props) {
  const cls = ["btn", `btn--${variant}`, wide ? "btn--wide" : "", grow ? "actionbar__main" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" {...rest} className={cls}>
      {icon}
      <span className="btn__label">{children}</span>
      {trailingIcon}
    </button>
  );
}

/** A 40 px round icon button with a 44 px hit area. A link when `link` is set. */
export function IconButton(props: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  link?: LinkProps;
  pressed?: boolean;
}) {
  const inner = <Icon icon={props.icon} />;
  if (props.link !== undefined) {
    return (
      <Link
        {...props.link}
        className="icon-btn"
        aria-label={props.label}
        activeOptions={{ exact: true }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={props.label}
      {...(props.pressed === undefined ? {} : { "aria-pressed": props.pressed })}
      {...(props.onClick === undefined ? {} : { onClick: props.onClick })}
    >
      {inner}
    </button>
  );
}
