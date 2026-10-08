import type { StepState } from "@study-spot/ui-logic";

/** One 4 px segment per required section: done ink, current red, todo mist. */
export function StepBar(props: { steps: readonly StepState[]; label: string }) {
  return (
    <div className="stepbar" role="img" aria-label={props.label}>
      {props.steps.map((s, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity beyond their position
        <span key={i} className={`stepbar__step stepbar__step--${s}`} />
      ))}
    </div>
  );
}
