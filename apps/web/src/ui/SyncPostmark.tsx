import type { SyncHeader } from "@study-spot/ui-logic";
import { headerText } from "../lib/format.ts";

/**
 * The header's sync postmark: a small cancellation ring and a short status.
 * Waves mean waiting, a filled dot means trouble; text says which. Tapping it
 * opens the sheet of changes on this phone.
 */
export function SyncPostmark(props: { header: SyncHeader; onOpen: () => void }) {
  const { header } = props;
  const trouble =
    header.kind === "failed" || header.kind === "unreadable" || header.kind === "signed_out";
  const idle = header.kind === "all_synced";
  return (
    <button
      type="button"
      className={`syncmark${trouble ? " syncmark--trouble" : ""}${header.kind === "syncing" ? " syncmark--busy" : ""}`}
      onClick={props.onOpen}
      aria-haspopup="dialog"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="syncmark__ring">
        <circle cx="10" cy="10" r="8.5" />
        {idle ? (
          <path d="M6 10.5l2.5 2.5L14 7.5" />
        ) : trouble ? (
          <circle cx="10" cy="10" r="3.5" className="syncmark__dot" />
        ) : (
          <path d="M4.5 8.5c1.8-1.4 3.7 1.4 5.5 0s3.7-1.4 5.5 0M4.5 11.5c1.8-1.4 3.7 1.4 5.5 0s3.7-1.4 5.5 0" />
        )}
      </svg>
      <span className="syncmark__text">{headerText(header)}</span>
    </button>
  );
}
