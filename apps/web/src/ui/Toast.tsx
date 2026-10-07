/** One short confirmation at a time, announced politely, above the pinned action. */
export function Toast(props: {
  message: { text: string; key: number } | null;
  onDismiss: () => void;
}) {
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {props.message === null ? null : (
        <button key={props.message.key} type="button" className="toast" onClick={props.onDismiss}>
          {props.message.text}
        </button>
      )}
    </div>
  );
}
