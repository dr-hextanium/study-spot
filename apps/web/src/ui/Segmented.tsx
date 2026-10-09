import { CircleAlert, type LucideIcon } from "lucide-react";
import { type CSSProperties, useEffect, useId, useState } from "react";
import { Icon } from "./Icon.tsx";

export type Option<V extends string> = { value: V; label: string };

type Props<V extends string> = {
  label: string;
  options: readonly Option<V>[];
  value: V | null;
  onChange: (value: V) => void;
  helper?: string | undefined;
  error?: string | undefined;
  /** "row" for up to 4 short options; "list" stacks long options as rows. */
  layout?: "row" | "list";
  /** Keeps the label for screen readers when a heading above already says it. */
  hideLabel?: boolean;
  icon?: LucideIcon | undefined;
};

/**
 * One choice from a few. Native radios underneath, so arrow keys, forms, and
 * screen readers behave as usual; the chosen option sits on a paper thumb.
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
  icon,
}: Props<V>) {
  const name = useId();
  const labelId = useId();
  const helpId = useId();
  // Shown on pointerdown so the control feels instant (it used to wait for the
  // click at pointerup); committed on pointerup over the same option. A
  // pointercancel (a scroll that began here) or a release elsewhere drops it.
  const [pending, setPending] = useState<V | null>(null);
  useEffect(() => {
    if (pending === null) return;
    const drop = () => setPending(null);
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
    return () => {
      window.removeEventListener("pointerup", drop);
      window.removeEventListener("pointercancel", drop);
    };
  }, [pending]);
  const shown = pending ?? value;
  const index = options.findIndex((o) => o.value === shown);
  return (
    <fieldset
      className={`field segmented segmented--${layout}${error === undefined ? "" : " field--error"}`}
      aria-describedby={helper !== undefined || error !== undefined ? helpId : undefined}
    >
      <legend className={`field__label${hideLabel ? " visually-hidden" : ""}`} id={labelId}>
        {icon === undefined ? null : <Icon icon={icon} size={16} />}
        {label}
      </legend>
      <div className="segmented__options" data-empty={index < 0 ? "" : undefined}>
        {layout === "row" ? (
          <span
            className="segmented__thumb"
            aria-hidden="true"
            style={{ "--n": options.length, "--i": Math.max(0, index) } as CSSProperties}
          />
        ) : null}
        {options.map((o) => (
          <label
            key={o.value}
            className="segmented__option"
            onPointerDown={(e) => {
              if (e.isPrimary && e.button === 0) setPending(o.value);
            }}
            onPointerUp={(e) => {
              // Touch pointers are captured, so this fires on the pressed label even
              // when the finger lifts elsewhere: commit only inside its bounds.
              const r = e.currentTarget.getBoundingClientRect();
              const inside =
                e.clientX >= r.left &&
                e.clientX <= r.right &&
                e.clientY >= r.top &&
                e.clientY <= r.bottom;
              if (inside && pending === o.value && value !== o.value) onChange(o.value);
            }}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={shown === o.value}
              onChange={() => {
                setPending(null);
                if (value !== o.value) onChange(o.value);
              }}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
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
    </fieldset>
  );
}
