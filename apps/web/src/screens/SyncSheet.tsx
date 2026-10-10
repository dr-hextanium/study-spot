import { isLocalId, type SyncHeader, t, type WriteRecord } from "@study-spot/ui-logic";
import { Link } from "@tanstack/react-router";
import {
  Check,
  CircleAlert,
  Clock,
  FileWarning,
  type LucideIcon,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useCalmSyncHeader, useOutboxSnapshot } from "../hooks/useOutbox.ts";
import { useSpotList } from "../hooks/useQueries.ts";
import { headerLong, whatOf } from "../lib/format.ts";
import { spotNames } from "../lib/names.ts";
import { Button } from "../ui/Button.tsx";
import { Crossfade } from "../ui/Crossfade.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ConfirmSheet, Sheet } from "../ui/Sheet.tsx";

const STATE_ICON = {
  pending: Clock,
  syncing: RefreshCw,
  failed: CircleAlert,
  conflict: TriangleAlert,
} as const satisfies Record<WriteRecord["state"], LucideIcon>;

function headerIcon(kind: SyncHeader["kind"]): LucideIcon {
  switch (kind) {
    case "all_synced":
      return Check;
    case "syncing":
      return RefreshCw;
    case "failed":
    case "unreadable":
      return CircleAlert;
    default:
      return Clock;
  }
}

/** Everything waiting on this phone: the one place connectivity detail lives. */
export function SyncSheet(props: { open: boolean; onClose: () => void }) {
  const { outbox } = useDeps();
  const snapshot = useOutboxSnapshot();
  const header = useCalmSyncHeader();
  const list = useSpotList();
  const names = spotNames(list.data, snapshot.records);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [discarding, setDiscarding] = useState<string | null>(null);
  useEffect(() => {
    if (!props.open || snapshot.unreadable === 0) {
      setUnreadable([]);
      return;
    }
    let live = true;
    void outbox
      .unreadableKeys()
      .then((keys) => {
        if (live) setUnreadable(keys);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [props.open, snapshot.unreadable, outbox]);

  const empty = snapshot.loaded && snapshot.records.length === 0 && snapshot.unreadable === 0;
  return (
    <>
      <Sheet
        open={props.open && discarding === null}
        title={t("sync.sheet.title")}
        onClose={props.onClose}
      >
        <p className="sync-status">
          <Crossfade id={headerLong(header)}>
            <Icon icon={headerIcon(header.kind)} />
            <span>{headerLong(header)}</span>
          </Crossfade>
        </p>
        {empty ? <p className="empty">{t("sync.sheet.empty")}</p> : null}
        {snapshot.records.length > 0 ? (
          <ul className="row-list">
            {snapshot.records.map((r) => {
              const spotName = names.get(r.spot_id) ?? "";
              const what = whatOf(r, spotName);
              const text =
                r.state === "failed"
                  ? t("sync.sheet.item_failed", { what })
                  : r.state === "conflict"
                    ? t("sync.sheet.item_conflict", { what })
                    : t("sync.sheet.item_pending", { what });
              const bad = r.state === "failed" || r.state === "conflict";
              return (
                <li key={r.client_write_id} className="sync-row">
                  <Icon
                    icon={STATE_ICON[r.state]}
                    className={bad ? "sync-row__icon--bad" : "sync-row__icon"}
                  />
                  <span className="sync-row__text">
                    {text}
                    {r.kind === "spot.create" && isLocalId(r.spot_id) ? (
                      <span className="sync-row__note">{t("sync.sheet.local_only")}</span>
                    ) : null}
                  </span>
                  <Link
                    to="/survey/spots/$id"
                    params={{ id: r.spot_id }}
                    className="btn btn--quiet"
                    aria-label={
                      spotName === ""
                        ? t("sync.sheet.open_spot")
                        : t("sync.sheet.open_spot_named", { name: spotName })
                    }
                    onClick={props.onClose}
                  >
                    <span className="btn__label">{t("sync.sheet.open_spot")}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
        {unreadable.length > 0 ? (
          <>
            <p className="sync-note">{t("sync.sheet.unreadable_help")}</p>
            <ul className="row-list">
              {unreadable.map((key) => (
                <li key={key} className="sync-row">
                  <Icon icon={FileWarning} className="sync-row__icon--bad" />
                  <span className="sync-row__text">{t("sync.sheet.unreadable_item")}</span>
                  <Button variant="danger" onClick={() => setDiscarding(key)}>
                    {t("common.discard")}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="sync-note">{t("sync.sheet.other_phone_warning")}</p>
      </Sheet>
      <ConfirmSheet
        open={discarding !== null}
        title={t("failed.discard")}
        body={t("failed.discard.confirm")}
        action={t("failed.discard")}
        cancel={t("common.cancel")}
        destructive
        onCancel={() => setDiscarding(null)}
        onConfirm={() => {
          const key = discarding;
          setDiscarding(null);
          if (key !== null) void outbox.discardUnreadable(key);
        }}
      />
    </>
  );
}
