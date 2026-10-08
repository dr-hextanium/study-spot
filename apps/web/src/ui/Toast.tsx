import { Check } from "lucide-react";
import { Icon } from "./Icon.tsx";

/** One short confirmation at a time, announced politely, above the action bar. */
export function Toast(props: {
  message: { text: string; key: number } | null;
  onDismiss: () => void;
}) {
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {props.message === null ? null : (
        <button key={props.message.key} type="button" className="toast" onClick={props.onDismiss}>
          <Icon icon={Check} />
          <span>{props.message.text}</span>
        </button>
      )}
    </div>
  );
}
