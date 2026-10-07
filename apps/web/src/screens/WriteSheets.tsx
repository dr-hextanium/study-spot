import { conflictDiff, failureView, t, type WriteRecord } from "@study-spot/ui-logic";
import { useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useToasts } from "../hooks/useToasts.tsx";
import { fieldName, fieldValueText } from "../lib/fields.ts";
import { sectionName, whatOf } from "../lib/format.ts";
import { Button } from "../ui/Button.tsx";
import { ConfirmSheet, Sheet } from "../ui/Sheet.tsx";

function subject(record: WriteRecord, spotName: string): string {
  if (record.kind === "spot.section") return sectionName(record.payload.section);
  if (record.kind === "spot.verify" && record.payload.groups[0] !== undefined) {
    return sectionName(record.payload.groups[0]);
  }
  return spotName;
}

/**
 * Two versions of one section, field by field (journey edge 4). Keep mine sends
 * the edit again on top of the server's version; Keep theirs drops it. Nothing
 * is overwritten silently either way.
 */
export function ConflictSheet(props: {
  record: WriteRecord;
  spotName: string;
  onClose: () => void;
}) {
  const { outbox } = useDeps();
  const toasts = useToasts();
  const { record } = props;
  const rows = conflictDiff(record);
  const editor = record.current?.last_edited_by_name ?? null;
  async function choose(choice: "mine" | "theirs") {
    await outbox.resolveConflict(record.client_write_id, choice);
    toasts.show(choice === "mine" ? t("conflict.resolved") : t("conflict.dropped"));
    props.onClose();
  }
  return (
    <Sheet
      open
      title={t("conflict.title", { section: subject(record, props.spotName) })}
      onClose={props.onClose}
      actions={
        <>
          <Button variant="primary" wide onClick={() => void choose("mine")}>
            {t("conflict.keep_mine")}
          </Button>
          <Button wide onClick={() => void choose("theirs")}>
            {t("conflict.keep_theirs")}
          </Button>
        </>
      }
    >
      <p>{editor === null ? t("conflict.body_unknown") : t("conflict.body", { name: editor })}</p>
      {rows.length === 0 ? null : (
        <table className="diff">
          <thead>
            <tr>
              <td />
              <th scope="col" className="label">
                {t("conflict.yours")}
              </th>
              <th scope="col" className="label">
                {t("conflict.theirs")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.field}>
                <th scope="row">{fieldName(row.field)}</th>
                <td className="diff__mine">{fieldValueText(row.field, row.yours)}</td>
                <td>{fieldValueText(row.field, row.theirs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Sheet>
  );
}

/** A change the server refused: why, in the deck's words, and Retry or Discard. */
export function FailedSheet(props: { record: WriteRecord; spotName: string; onClose: () => void }) {
  const { outbox } = useDeps();
  const { record } = props;
  const [confirming, setConfirming] = useState(false);
  const view = failureView(record.error);
  return (
    <>
      <Sheet
        open={!confirming}
        title={t("failed.title")}
        onClose={props.onClose}
        actions={
          <>
            {view.canRetry ? (
              <Button
                variant="primary"
                wide
                onClick={() => {
                  void outbox.retry(record.client_write_id);
                  props.onClose();
                }}
              >
                {t("failed.retry")}
              </Button>
            ) : null}
            <Button
              variant={view.canRetry ? "secondary" : "danger"}
              wide
              onClick={() => setConfirming(true)}
            >
              {t("failed.discard")}
            </Button>
          </>
        }
      >
        <p className="label">{whatOf(record, props.spotName)}</p>
        <p>{view.message}</p>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title={t("failed.discard")}
        body={t("failed.discard.confirm")}
        action={t("failed.discard")}
        cancel={t("common.cancel")}
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          void outbox.discard(record.client_write_id);
          props.onClose();
        }}
      />
    </>
  );
}
