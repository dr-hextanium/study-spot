import { isLocalId, t } from "@study-spot/ui-logic";
import { useEffect, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useOutboxSnapshot, useSyncHeader } from "../hooks/useOutbox.ts";
import { useSpotList } from "../hooks/useQueries.ts";
import { headerLong, whatOf } from "../lib/format.ts";
import { spotNames } from "../lib/names.ts";
import { Button } from "../ui/Button.tsx";
import { ConfirmSheet, Sheet } from "../ui/Sheet.tsx";

/** Everything waiting on this phone: the one place connectivity detail lives. */
export function SyncSheet(props: { open: boolean; onClose: () => void }) {
  const { outbox } = useDeps();
  const snapshot = useOutboxSnapshot();
  const header = useSyncHeader();
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
        <p className="title">{headerLong(header)}</p>
        {empty ? <p className="empty">{t("sync.sheet.empty")}</p> : null}
        {snapshot.records.length > 0 ? (
          <ul className="ruled-list">
            {snapshot.records.map((r) => {
              const what = whatOf(r, names.get(r.spot_id) ?? "");
              const text =
                r.state === "failed"
                  ? t("sync.sheet.item_failed", { what })
                  : r.state === "conflict"
                    ? t("sync.sheet.item_conflict", { what })
                    : t("sync.sheet.item_pending", { what });
              return (
                <li key={r.client_write_id} className="entry">
                  <span className="entry__text">
                    {text}
                    {r.kind === "spot.create" && isLocalId(r.spot_id) ? (
                      <span className="entry__note">{t("sync.sheet.local_only")}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {unreadable.length > 0 ? (
          <>
            <p className="lede">{t("sync.sheet.unreadable_help")}</p>
            <ul className="ruled-list">
              {unreadable.map((key) => (
                <li key={key} className="entry">
                  <span className="entry__text">{t("sync.sheet.unreadable_item")}</span>
                  <Button variant="quiet" onClick={() => setDiscarding(key)}>
                    {t("common.discard")}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="lede">{t("sync.sheet.other_phone_warning")}</p>
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
