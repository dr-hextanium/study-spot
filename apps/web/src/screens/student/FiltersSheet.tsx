import type { Criterion } from "@perch/core";
import {
  FILTER_GROUP,
  FILTERS,
  type FilterDef,
  type FilterGroup,
  filterGroupLabel,
  isOn,
  t,
  toggle,
} from "@perch/ui-logic";
import type { ReactNode } from "react";
import { Button } from "../../ui/Button.tsx";
import { Check, TagGroup } from "../../ui/Check.tsx";
import { Sheet } from "../../ui/Sheet.tsx";

/**
 * The extra filters as tag toggles, one group per kind. Each change applies at once.
 * Home shows its short list; Browse passes every filter, its own title, and its two
 * switches as children, which sit above the groups.
 */
export function FiltersSheet(props: {
  open: boolean;
  extra: readonly Criterion[];
  onChange: (extra: Criterion[]) => void;
  onClose: () => void;
  title?: string;
  groups?: readonly FilterGroup[];
  filters?: readonly FilterDef[];
  /** Clear also resets whatever the children control. Defaults to clearing the tags. */
  onClear?: () => void;
  children?: ReactNode;
}) {
  const groups = props.groups ?? FILTER_GROUP;
  const filters = props.filters ?? FILTERS;
  return (
    <Sheet
      open={props.open}
      title={props.title ?? t("student.home.filters.title")}
      onClose={props.onClose}
      actions={
        <>
          <Button variant="quiet" wide onClick={props.onClear ?? (() => props.onChange([]))}>
            {t("student.home.filters.clear")}
          </Button>
          <Button variant="ink" wide onClick={props.onClose}>
            {t("student.home.filters.done")}
          </Button>
        </>
      }
    >
      {props.children}
      {groups.map((group) => (
        <TagGroup key={group} label={filterGroupLabel(group)}>
          {filters
            .filter((f) => f.group === group)
            .map((f) => (
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
    </Sheet>
  );
}
