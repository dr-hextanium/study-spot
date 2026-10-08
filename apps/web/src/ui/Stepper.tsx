import { t } from "@study-spot/ui-logic";
import { CircleAlert, type LucideIcon, Minus, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Icon } from "./Icon.tsx";

type Props = {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** A unit after the number, like "%" or "min". */
  suffix?: string;
  helper?: string | undefined;
  error?: string | undefined;
  icon?: LucideIcon | undefined;
};

/** A number with Less and More buttons, and a keypad field for typing it outright. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  suffix,
  helper,
  error,
  icon,
}: Props) {
  const inputId = useId();
  const labelId = useId();
  const helpId = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setText(value === null ? "" : String(value));
  }, [value]);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  // While typing, keep the text as entered and report only in-range numbers, so
  // "2" on the way to "25" is not yanked up to the minimum.
  const edit = (raw: string) => {
    setText(raw);
    if (raw === "") return onChange(null);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
  };
  // On blur, clamp and make the box show what is stored.
  const settle = () => {
    if (text === "") return;
    const n = clamp(Number(text));
    setText(String(n));
    onChange(n);
  };
  const bump = (dir: 1 | -1) => {
    const typed = text === "" ? value : Number(text);
    const next = clamp((typed ?? (dir > 0 ? min - step : min)) + dir * step);
    setText(String(next));
    onChange(next);
  };
  return (
    <fieldset className={`field stepper${error === undefined ? "" : " field--error"}`}>
      <legend className="label field__label" id={labelId}>
        {icon === undefined ? null : <Icon icon={icon} size={16} />}
        {label}
      </legend>
      <div className="stepper__row">
        <button
          type="button"
          className="stepper__btn"
          aria-label={t("common.less")}
          disabled={value !== null && value <= min}
          onClick={() => bump(-1)}
        >
          <Icon icon={Minus} />
        </button>
        <input
          id={inputId}
          aria-labelledby={labelId}
          className="input stepper__input"
          inputMode="numeric"
          pattern="[0-9]*"
          value={text}
          aria-describedby={helper !== undefined || error !== undefined ? helpId : undefined}
          aria-invalid={error !== undefined}
          onBlur={settle}
          onChange={(e) => edit(e.currentTarget.value.replace(/[^0-9]/g, ""))}
        />
        {suffix === undefined ? null : (
          <span className="stepper__unit" aria-hidden="true">
            {suffix}
          </span>
        )}
        <button
          type="button"
          className="stepper__btn"
          aria-label={t("common.more")}
          disabled={value !== null && value >= max}
          onClick={() => bump(1)}
        >
          <Icon icon={Plus} />
        </button>
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
