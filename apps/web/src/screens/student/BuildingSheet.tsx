import type { BundleBuilding } from "@perch/core";
import { t } from "@perch/ui-logic";
import { Check } from "lucide-react";
import { useState } from "react";
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
};

/** A search-and-pick sheet over bundle buildings. The chosen one carries an ink check. */
export function BuildingSheet(props: Props) {
  const [query, setQuery] = useState("");
  const matches = matchBuildings(props.buildings, query);
  const none = props.noneLabel !== undefined && query.trim() === "";
  const mark = (on: boolean) => (on ? <Icon icon={Check} /> : undefined);
  return (
    <Sheet
      open={props.open}
      title={props.title}
      onClose={() => {
        setQuery("");
        props.onClose();
      }}
    >
      {props.buildings.length > 6 ? (
        <Search label={props.title} placeholder={props.title} value={query} onChange={setQuery} />
      ) : null}
      <ul className="row-list">
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
            end={mark(b.id === props.value)}
            onClick={() => {
              setQuery("");
              props.onPick(b.id);
            }}
          />
        ))}
      </ul>
      {matches.length === 0 ? <p className="field__helper">{t("new.building.none")}</p> : null}
    </Sheet>
  );
}
