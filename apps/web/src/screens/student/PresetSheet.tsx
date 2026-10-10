import type { Criterion } from "@perch/core";
import {
  FILTER_GROUP,
  FILTERS,
  filterGroupLabel,
  isOn,
  type SaveResult,
  t,
  toggle,
} from "@perch/ui-logic";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/Button.tsx";
import { Check, TagGroup } from "../../ui/Check.tsx";
import { TextField } from "../../ui/Field.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Sheet } from "../../ui/Sheet.tsx";

const MAX_NAME = 24;

type Props = {
  open: boolean;
  /** Saves the preset; an error comes back to show on the sheet. */
  onSave: (input: { name: string; extra: readonly Criterion[] }) => SaveResult;
  onClose: () => void;
};

/** A name and filters become a preset. Stays open on an error, closes on success. */
export function PresetSheet(props: Props) {
  const [name, setName] = useState("");
  const [extra, setExtra] = useState<Criterion[]>([]);
  const [error, setError] = useState<Extract<SaveResult, { ok: false }>["error"] | null>(null);
  const close = (): void => {
    setName("");
    setExtra([]);
    setError(null);
    props.onClose();
  };
  const save = (): void => {
    const result = props.onSave({ name, extra });
    if (result.ok) close();
    else setError(result.error);
  };
  return (
    <Sheet
      open={props.open}
      title={t("student.me.preset.new")}
      onClose={close}
      actions={
        <>
          <Button variant="primary" wide onClick={save}>
            {t("student.me.preset.save")}
          </Button>
          <Button variant="quiet" wide onClick={close}>
            {t("common.cancel")}
          </Button>
        </>
      }
    >
      <TextField
        label={t("student.me.preset.name")}
        value={name}
        maxLength={MAX_NAME}
        onChange={(v) => {
          setName(v);
          if (error === "name_required") setError(null);
        }}
        error={error === "name_required" ? t("student.me.preset.name_required") : undefined}
      />
      {FILTER_GROUP.map((group) => (
        <TagGroup key={group} label={filterGroupLabel(group)}>
          {FILTERS.filter((f) => f.group === group).map((f) => (
            <Check
              key={f.id}
              variant="tag"
              label={t(f.label)}
              checked={isOn(extra, f.id)}
              onChange={() => {
                setExtra((cur) => toggle(cur, f.id));
                if (error === "filters_required") setError(null);
              }}
            />
          ))}
        </TagGroup>
      ))}
      {error === "filters_required" || error === "full" ? (
        <p className="field__error" role="alert">
          <Icon icon={CircleAlert} size={16} />
          {error === "full" ? t("student.me.preset.full") : t("student.me.preset.filters_required")}
        </p>
      ) : null}
    </Sheet>
  );
}
