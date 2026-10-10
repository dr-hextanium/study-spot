import { t } from "@perch/ui-logic";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { IconButton } from "./Button.tsx";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned below the scrolling body, e.g. the two choices of a confirm. */
  actions?: ReactNode;
};

/**
 * A bottom sheet on the native modal <dialog>: focus moves in and is trapped,
 * Escape and the close button dismiss, and the page behind is inert. Slides up
 * on phones, a centered dialog from 768 px. Floating things (sheets, toasts) are the only elements that cast a shadow.
 */
export function Sheet({ open, title, onClose, children, actions }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      // Only Escape and the close button dismiss; closing it from code (a confirm
      // taking over) must not report a dismissal.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="sheet__grab" aria-hidden="true" />
      <div className="sheet__head">
        <h2 className="sheet__title" id={titleId}>
          {title}
        </h2>
        <IconButton label={t("common.close")} icon={X} onClick={onClose} />
      </div>
      <div className="sheet__body">{children}</div>
      {actions === undefined ? null : <div className="sheet__actions">{actions}</div>}
    </dialog>
  );
}

type ConfirmProps = {
  open: boolean;
  title: string;
  body: string;
  action: string;
  cancel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** A sheet that asks once before something that cannot be undone. */
export function ConfirmSheet(p: ConfirmProps) {
  return (
    <Sheet
      open={p.open}
      title={p.title}
      onClose={p.onCancel}
      actions={
        <>
          <button
            type="button"
            className={`btn btn--wide ${p.destructive === true ? "btn--danger" : "btn--primary"}`}
            onClick={p.onConfirm}
          >
            <span className="btn__label">{p.action}</span>
          </button>
          <button type="button" className="btn btn--wide btn--quiet" onClick={p.onCancel}>
            <span className="btn__label">{p.cancel}</span>
          </button>
        </>
      }
    >
      <p className="sheet__text">{p.body}</p>
    </Sheet>
  );
}
