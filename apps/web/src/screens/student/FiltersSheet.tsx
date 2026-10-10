import type { Criterion } from "@perch/core";
import { FILTER_GROUP, FILTERS, filterGroupLabel, isOn, t, toggle } from "@perch/ui-logic";
import type { ReactNode } from "react";
import { Button } from "../../ui/Button.tsx";
import { Check, TagGroup } from "../../ui/Check.tsx";
import { Sheet } from "../../ui/Sheet.tsx";

/** The extra filters as tag toggles, one group per kind. Each change applies at once. */
export function FiltersSheet(props: {
  open: boolean;
  extra: readonly Criterion[];
  onChange: (extra: Criterion[]) => void;
  onClose: () => void;
  /** Browse adds its own switches under the groups. */
  children?: ReactNode;
}) {
  return (
    <Sheet
      open={props.open}
      title={t("student.home.filters.title")}
      onClose={props.onClose}
      actions={
        <>
          <Button variant="quiet" wide onClick={() => props.onChange([])}>
            {t("student.home.filters.clear")}
          </Button>
          <Button variant="ink" wide onClick={props.onClose}>
            {t("student.home.filters.done")}
          </Button>
        </>
      }
    >
      {FILTER_GROUP.map((group) => (
        <TagGroup key={group} label={filterGroupLabel(group)}>
          {FILTERS.filter((f) => f.group === group).map((f) => (
            <Check
              key={f.id}
              variant="tag"
              label={t(f.label)}
              checked={isOn(props.extra, f.id)}
              onChange={() => props.onChange(toggle(props.extra, f.id))}
            />
          ))}
        </TagGroup>
      ))}
      {props.children}
    </Sheet>
  );
}
