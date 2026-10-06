import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "quiet";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  /** Full width, for the pinned action and sheet actions. */
  wide?: boolean;
  icon?: ReactNode;
  children: ReactNode;
};

/** Ink primary, outlined secondary, stamp-red destructive, and a quiet text button. */
export function Button({ variant = "secondary", wide = false, icon, children, ...rest }: Props) {
  const cls = ["btn", `btn--${variant}`, wide ? "btn--wide" : ""].filter(Boolean).join(" ");
  return (
    <button type="button" {...rest} className={cls}>
      {icon}
      <span className="btn__label">{children}</span>
    </button>
  );
}
