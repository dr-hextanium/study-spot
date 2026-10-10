import { tokens } from "@study-spot/ui-logic";
import { type ReactNode, useEffect, useState } from "react";

type Layer = { id: string; node: ReactNode };

/** The fade length, matching --duration-base in the CSS. */
export const CROSSFADE_MS = tokens.duration.base ?? 0;

/**
 * Swaps its content with a short crossfade instead of a hard cut. `id` names the
 * content: a new id fades the old layer out over the new one. The leaving layer
 * is aria-hidden, so a control's name is always the current content. Under
 * reduced motion the leaving layer is not drawn at all.
 */
export function Crossfade(props: { id: string; children: ReactNode }) {
  const [current, setCurrent] = useState<Layer>({ id: props.id, node: props.children });
  const [leaving, setLeaving] = useState<Layer | null>(null);
  if (current.id !== props.id) {
    setLeaving(current);
    setCurrent({ id: props.id, node: props.children });
  }
  useEffect(() => {
    if (leaving === null) return;
    const timer = setTimeout(() => setLeaving(null), CROSSFADE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  return (
    <span className="xfade">
      {leaving === null ? null : (
        <span key={leaving.id} className="xfade__layer xfade__layer--out" aria-hidden="true">
          {leaving.node}
        </span>
      )}
      <span key={props.id} className={`xfade__layer${leaving === null ? "" : " xfade__layer--in"}`}>
        {props.children}
      </span>
    </span>
  );
}
