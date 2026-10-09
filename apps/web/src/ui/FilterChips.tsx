/** A row of toggle chips with counts; one is pressed. 32 px drawn, 44 px to hit. */
export function FilterChips<V extends string>(props: {
  label: string;
  options: { value: V; label: string; count: number }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <fieldset className="chips">
      <legend className="visually-hidden">{props.label}</legend>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="chip"
          aria-pressed={o.value === props.value}
          onClick={() => props.onChange(o.value)}
        >
          {o.label} <span className="count">{o.count}</span>
        </button>
      ))}
    </fieldset>
  );
}
