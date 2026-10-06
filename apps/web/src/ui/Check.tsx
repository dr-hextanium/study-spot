type Props = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  helper?: string | undefined;
};

/** A yes-or-no line: native checkbox, ruled row, ballpoint tick. */
export function Check({ label, checked, onChange, helper }: Props) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="check__text">
        <span className="check__label">{label}</span>
        {helper === undefined ? null : <span className="field__helper">{helper}</span>}
      </span>
    </label>
  );
}
