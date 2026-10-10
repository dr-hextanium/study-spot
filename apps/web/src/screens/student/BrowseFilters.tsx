import type { Criterion } from "@perch/core";
import {
  BROWSE_FILTER_GROUPS,
  BROWSE_FILTERS,
  browseFilterGroupLabel,
  isBrowseFilterOn,
  t,
  toggleBrowseFilter,
} from "@perch/ui-logic";
import { Button } from "../../ui/Button.tsx";
import { Check, TagGroup } from "../../ui/Check.tsx";
import { Sheet } from "../../ui/Sheet.tsx";

/**
 * The Browse filter sheet: the two switches (open on arrival, show locked spots),
 * then one tag group per kind of attribute. Every tag is a required filter.
 */
export function BrowseFilters(props: {
  open: boolean;
  extra: readonly Criterion[];
  openOnly: boolean;
  showLocked: boolean;
  onChange(next: { extra?: Criterion[]; openOnly?: boolean; showLocked?: boolean }): void;
  onClose(): void;
}) {
  return (
    <Sheet
      open={props.open}
      title={t("student.browse.filters.title")}
      onClose={props.onClose}
      actions={
        <>
          <Button
            variant="quiet"
            wide
            onClick={() => props.onChange({ extra: [], openOnly: false, showLocked: false })}
          >
            {t("student.browse.filters.clear")}
          </Button>
          <Button variant="ink" wide onClick={props.onClose}>
            {t("student.browse.filters.done")}
          </Button>
        </>
      }
    >
      <Check
        label={t("student.browse.open_only")}
        checked={props.openOnly}
        onChange={(openOnly) => props.onChange({ openOnly })}
      />
      <Check
        label={t("student.browse.show_locked")}
        checked={props.showLocked}
        onChange={(showLocked) => props.onChange({ showLocked })}
      />
      {BROWSE_FILTER_GROUPS.map((group) => (
        <TagGroup key={group} label={browseFilterGroupLabel(group)}>
          {BROWSE_FILTERS.filter((f) => f.group === group).map((f) => (
            <Check
              key={f.id}
              variant="tag"
              label={t(f.label)}
              checked={isBrowseFilterOn(props.extra, f.id)}
              onChange={() => props.onChange({ extra: toggleBrowseFilter(props.extra, f.id) })}
            />
          ))}
        </TagGroup>
      ))}
    </Sheet>
  );
}
