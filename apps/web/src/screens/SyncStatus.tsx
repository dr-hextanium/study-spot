import type { SyncHeader } from "@study-spot/ui-logic";
import { CircleAlert, Cloud, CloudCheck, CloudOff, type LucideIcon, RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import { useSyncHeader } from "../hooks/useOutbox.ts";
import { headerLong, headerText } from "../lib/format.ts";
import { IconButton } from "../ui/Button.tsx";
import { Icon } from "../ui/Icon.tsx";
import { SyncSheet } from "./SyncSheet.tsx";

function iconFor(h: SyncHeader): LucideIcon {
  switch (h.kind) {
    case "all_synced":
      return CloudCheck;
    case "offline":
      return CloudOff;
    case "syncing":
    case "pending":
      return RefreshCw;
    case "failed":
    case "unreadable":
    case "signed_out":
      return CircleAlert;
    case "checking":
      return Cloud;
  }
}

/**
 * Sync state as an icon (top bar) or an icon with short text (action bar). The
 * accessible name is always the long text; tapping opens the sheet of changes.
 */
export function SyncStatus(props: { variant: "icon" | "bar" }) {
  const header = useSyncHeader();
  const descId = useId();
  const [open, setOpen] = useState(false);
  const icon = iconFor(header);
  const long = headerLong(header);
  const trouble =
    header.kind === "failed" || header.kind === "unreadable" || header.kind === "signed_out";
  const spin = header.kind === "syncing" || header.kind === "pending";
  return (
    <>
      {props.variant === "icon" ? (
        <span
          className={`sync sync--icon${trouble ? " sync--trouble" : ""}${spin ? " sync--busy" : ""}`}
        >
          <IconButton label={long} icon={icon} onClick={() => setOpen(true)} />
        </span>
      ) : (
        <button
          type="button"
          className={`btn btn--ghost sync sync--bar${trouble ? " sync--trouble" : ""}${spin ? " sync--busy" : ""}`}
          aria-describedby={descId}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <Icon icon={icon} />
          <span className="btn__label">{headerText(header)}</span>
        </button>
      )}
      {props.variant === "bar" ? (
        <span id={descId} className="visually-hidden">
          {long}
        </span>
      ) : null}
      <SyncSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
