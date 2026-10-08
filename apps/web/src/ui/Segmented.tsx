import { useId } from "react";

export type Option<V extends string> = { value: V; label: string };

type Props<V extends string> = {
  label: string;
  options: readonly Option<V>[];
  value: V | null;
  onChange: (value: V) => void;
  helper?: string | undefined;
  error?: string | undefined;
  /** "row" for up to 4 short options; "list" stacks long options on ruled lines. */
  layout?: "row" | "list";
  /** Keeps the label for screen readers when a heading above already says it. */
  hideLabel?: boolean;
};

/**
 * One choice from a few. Native radios underneath, so arrow keys, forms, and
 * screen readers behave as usual; the chosen option is inked in ballpoint blue.
 */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
  helper,
  error,
  layout = "row",
  hideLabel = false,
}: Props<V>) {
  const name = useId();
  const labelId = useId();
  const helpId = useId();
  return (
    <fieldset
      className={`field segmented segmented--${layout}${error === undefined ? "" : " field--error"}`}
      aria-describedby={helper !== undefined || error !== undefined ? helpId : undefined}
    >
      <legend className={`label field__label${hideLabel ? " visually-hidden" : ""}`} id={labelId}>
        {label}
      </legend>
      <div className="segmented__options">
        {options.map((o) => (
          <label key={o.value} className="segmented__option">
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {error !== undefined ? (
        <p className="field__error" id={helpId}>
          {error}
        </p>
      ) : helper !== undefined ? (
        <p className="field__helper" id={helpId}>
          {helper}
        </p>
      ) : null}
    </fieldset>
  );
}
