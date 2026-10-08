import { Check as CheckIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";

type Props = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  helper?: string | undefined;
  /** "tag" is a pill toggle for a group; "row" is a full-width line with a switch. */
  variant?: "tag" | "row";
  icon?: LucideIcon | undefined;
};

/** A yes-or-no toggle on a native checkbox: a tag in a group, or a row with a switch. */
export function Check({ label, checked, onChange, helper, variant = "row", icon }: Props) {
  if (variant === "tag") {
    return (
      <label className="tag">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
        {checked ? (
          <Icon icon={CheckIcon} size={16} />
        ) : icon === undefined ? null : (
          <Icon icon={icon} size={16} />
        )}
        <span>{label}</span>
      </label>
    );
  }
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="check__text">
        <span className="check__label">
          {icon === undefined ? null : <Icon icon={icon} size={16} />}
          {label}
        </span>
        {helper === undefined ? null : <span className="field__helper">{helper}</span>}
      </span>
      <span className="check__switch" aria-hidden="true" />
    </label>
  );
}

/** A fieldset of tag toggles under one label. */
export function TagGroup(props: {
  label: string;
  icon?: LucideIcon | undefined;
  helper?: string | undefined;
  children: ReactNode;
}) {
  return (
    <fieldset className="field">
      <legend className="label field__label">
        {props.icon === undefined ? null : <Icon icon={props.icon} size={16} />}
        {props.label}
      </legend>
      <div className="tags">{props.children}</div>
      {props.helper === undefined ? null : <p className="field__helper">{props.helper}</p>}
    </fieldset>
  );
}
