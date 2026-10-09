import { conflictDiff, failureView, t, type WriteRecord } from "@study-spot/ui-logic";
import { useNavigate } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import { useId, useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useToasts } from "../hooks/useToasts.tsx";
import { fieldName, fieldValueText } from "../lib/fields.ts";
import { sectionName, whatOf } from "../lib/format.ts";
import { Button } from "../ui/Button.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ConfirmSheet, Sheet } from "../ui/Sheet.tsx";

function subject(record: WriteRecord, spotName: string): string {
  if (record.kind === "spot.section") return sectionName(record.payload.section);
  if (record.kind === "spot.verify" && record.payload.groups[0] !== undefined) {
    return sectionName(record.payload.groups[0]);
  }
  return spotName;
}

type DiffRow = ReturnType<typeof conflictDiff>[number];

/** One side of a conflict: the same fields in the same order on both sides, so they read across. */
function DiffBlock(props: {
  id: string;
  heading: string;
  rows: { field: DiffRow["field"]; value: DiffRow["yours"] }[];
  mine?: boolean;
}) {
  return (
    <section className="diff-block" aria-labelledby={props.id}>
      <h3 className="diff-block__heading" id={props.id}>
        {props.heading}
      </h3>
      <dl className="diff-block__list">
        {props.rows.map((row) => (
          <div key={row.field} className="diff-block__row">
            <dt>{fieldName(row.field)}</dt>
            <dd className={props.mine === true ? "diff-block__mine" : undefined}>
              {fieldValueText(row.field, row.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
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
  const blockId = useId();
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
          <Button variant="ink" wide onClick={() => void choose("theirs")}>
            {t("conflict.keep_theirs")}
          </Button>
        </>
      }
    >
      <p>{editor === null ? t("conflict.body_unknown") : t("conflict.body", { name: editor })}</p>
      {rows.length === 0 ? null : (
        <>
          <DiffBlock
            id={`${blockId}-mine`}
            heading={t("conflict.yours")}
            rows={rows.map((row) => ({ field: row.field, value: row.yours }))}
            mine
          />
          <DiffBlock
            id={`${blockId}-theirs`}
            heading={t("conflict.theirs")}
            rows={rows.map((row) => ({ field: row.field, value: row.theirs }))}
          />
        </>
      )}
    </Sheet>
  );
}

/** A change the server refused: why, in the deck's words, and Retry or Discard. */
export function FailedSheet(props: { record: WriteRecord; spotName: string; onClose: () => void }) {
  const { outbox } = useDeps();
  const navigate = useNavigate();
  const { record } = props;
  const [confirming, setConfirming] = useState(false);
  const toasts = useToasts();
  const view = failureView(record.error);
  // The queue could not be changed; read it back and say so, so the sheet is not left silent.
  const failed = () => {
    setConfirming(false);
    void outbox.reload().catch(() => undefined);
    toasts.show(t("common.save_failed"));
  };
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
                  outbox.retry(record.client_write_id).then(props.onClose, failed);
                }}
              >
                {t("failed.retry")}
              </Button>
            ) : null}
            <Button variant="danger" wide onClick={() => setConfirming(true)}>
              {t("failed.discard")}
            </Button>
          </>
        }
      >
        <p className="sheet__sub">{whatOf(record, props.spotName)}</p>
        <div className="reason" role="note">
          <Icon icon={CircleAlert} className="reason__icon" />
          <p>{view.message}</p>
        </div>
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
          outbox.discard(record.client_write_id).then(() => {
            props.onClose();
            // Dropping a create drops the whole draft, so there is no spot left to show.
            if (record.kind === "spot.create") void navigate({ to: "/survey", replace: true });
          }, failed);
        }}
      />
    </>
  );
}
