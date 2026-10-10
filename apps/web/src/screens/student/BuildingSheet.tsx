import type { BundleBuilding } from "@perch/core";
import { t } from "@perch/ui-logic";
import { Check, type LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Icon } from "../../ui/Icon.tsx";
import { Row } from "../../ui/Row.tsx";
import { Search } from "../../ui/Search.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { matchBuildings } from "../BuildingPicker.tsx";

type Props = {
  open: boolean;
  title: string;
  buildings: readonly BundleBuilding[];
  /** The chosen building id; null is the "none" row. */
  value: string | null;
  /** The first row, which picks null ("Off campus", "None"). Omit for a list with no such choice. */
  noneLabel?: string;
  onPick: (id: string | null) => void;
  onClose: () => void;
  /** Above the search: Home's From sheet puts Use my location here. */
  children?: ReactNode;
  /** The search field's label. Default: the title. */
  searchLabel?: string;
  /** Show the search even for a short list. Default: only past six buildings. */
  alwaysSearch?: boolean;
  /** Show at most this many matches. The chosen building stays in view with its check. */
  limit?: number;
  /** What an empty search says. */
  emptyText?: string;
  /** An icon at the start of each building row. */
  icon?: LucideIcon;
};

/** A search-and-pick sheet over bundle buildings. The chosen one carries an ink check. */
export function BuildingSheet(props: Props) {
  const [query, setQuery] = useState("");
  const all = matchBuildings(props.buildings, query);
  const limit = props.limit ?? all.length;
  const shown = all.slice(0, limit);
  const chosen = props.buildings.find((b) => b.id === props.value);
  const matches =
    query.trim() === "" && chosen !== undefined && !shown.includes(chosen)
      ? [chosen, ...shown.slice(0, Math.max(0, limit - 1))]
      : shown;
  const none = props.noneLabel !== undefined && query.trim() === "";
  const mark = (on: boolean) => (on ? <Icon icon={Check} className="picker__check" /> : undefined);
  const lead = props.icon === undefined ? undefined : <Icon icon={props.icon} />;
  const searchLabel = props.searchLabel ?? props.title;
  return (
    <Sheet
      open={props.open}
      title={props.title}
      onClose={() => {
        setQuery("");
        props.onClose();
      }}
    >
      {props.children}
      {props.alwaysSearch === true || props.buildings.length > 6 ? (
        <Search label={searchLabel} placeholder={searchLabel} value={query} onChange={setQuery} />
      ) : null}
      <ul className="row-list picker">
        {none ? (
          <Row
            compact
            title={props.noneLabel ?? ""}
            pressed={props.value === null}
            end={mark(props.value === null)}
            onClick={() => {
              setQuery("");
              props.onPick(null);
            }}
          />
        ) : null}
        {matches.map((b) => (
          <Row
            key={b.id}
            compact
            title={b.name}
            pressed={b.id === props.value}
            {...(lead === undefined ? {} : { lead })}
            end={mark(b.id === props.value)}
            onClick={() => {
              setQuery("");
              props.onPick(b.id);
            }}
          />
        ))}
      </ul>
      {matches.length === 0 ? (
        <p className="empty">{props.emptyText ?? t("new.building.none")}</p>
      ) : null}
    </Sheet>
  );
}
