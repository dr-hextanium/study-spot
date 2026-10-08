import { CircleAlert, type LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Icon } from "./Icon.tsx";

type FieldProps = {
  label: string;
  helper?: string | undefined;
  error?: string | undefined;
  /** "Optional" suffix on a screen that mixes required and optional fields. */
  optional?: string | undefined;
  icon?: LucideIcon | undefined;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
};

/**
 * One field: an optional icon and label above, the entry under it, helper or
 * error text below, a hairline at the bottom.
 */
export function Field({ label, helper, error, optional, icon, children }: FieldProps) {
  const inputId = useId();
  const helpId = useId();
  const describedBy = error !== undefined || helper !== undefined ? helpId : undefined;
  return (
    <div className={`field${error === undefined ? "" : " field--error"}`}>
      <label className="label field__label" htmlFor={inputId}>
        {icon === undefined ? null : <Icon icon={icon} size={16} />}
        {label}
        {optional === undefined ? null : <span className="field__optional">{optional}</span>}
      </label>
      {children({ inputId, describedBy })}
      {error !== undefined ? (
        <p className="field__error" id={helpId}>
          <Icon icon={CircleAlert} size={16} />
          {error}
        </p>
      ) : helper !== undefined ? (
        <p className="field__helper" id={helpId}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string | undefined;
  error?: string | undefined;
  optional?: string | undefined;
  icon?: LucideIcon | undefined;
  placeholder?: string | undefined;
  multiline?: boolean;
  inputMode?: "text" | "numeric" | "decimal" | "url";
  autoComplete?: string;
  maxLength?: number;
};

export function TextField(props: TextFieldProps) {
  return (
    <Field
      label={props.label}
      helper={props.helper}
      error={props.error}
      optional={props.optional}
      icon={props.icon}
    >
      {({ inputId, describedBy }) =>
        props.multiline === true ? (
          <textarea
            id={inputId}
            className="input input--multiline"
            value={props.value}
            placeholder={props.placeholder}
            aria-describedby={describedBy}
            aria-invalid={props.error !== undefined}
            maxLength={props.maxLength}
            rows={3}
            onChange={(e) => props.onChange(e.currentTarget.value)}
          />
        ) : (
          <input
            id={inputId}
            className="input"
            value={props.value}
            placeholder={props.placeholder}
            aria-describedby={describedBy}
            aria-invalid={props.error !== undefined}
            inputMode={props.inputMode}
            autoComplete={props.autoComplete ?? "off"}
            maxLength={props.maxLength}
            onChange={(e) => props.onChange(e.currentTarget.value)}
          />
        )
      }
    </Field>
  );
}
