import { t } from "@study-spot/ui-logic";
import { Minus, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";

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
}: Props) {
  const inputId = useId();
  const labelId = useId();
  const helpId = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    setText(value === null ? "" : String(value));
  }, [value]);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const commit = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") return onChange(null);
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(clamp(Math.round(n)));
  };
  const bump = (dir: 1 | -1) =>
    onChange(clamp((value ?? (dir > 0 ? min - step : min)) + dir * step));
  return (
    <fieldset className={`field stepper${error === undefined ? "" : " field--error"}`}>
      <legend className="label field__label" id={labelId}>
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
          <Minus aria-hidden="true" size={20} strokeWidth={2.25} />
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
          onChange={(e) => commit(e.currentTarget.value.replace(/[^0-9]/g, ""))}
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
          <Plus aria-hidden="true" size={20} strokeWidth={2.25} />
        </button>
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
