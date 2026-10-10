import type { CampusInfo } from "@perch/core";
import { t } from "@perch/ui-logic";
import { Building2, Check } from "lucide-react";
import { useId, useState } from "react";
import { Icon } from "../ui/Icon.tsx";
import { Row } from "../ui/Row.tsx";
import { Search } from "../ui/Search.tsx";

type Building = CampusInfo["buildings"][number];

export const LAST_BUILDING_KEY = "survey:last-building";
const SHOWN = 6;

/** Matches every typed word against the name, in any order. */
export function matchBuildings(buildings: readonly Building[], query: string): Building[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return buildings.filter((b) => words.every((w) => b.name.toLowerCase().includes(w)));
}

type Props = {
  buildings: readonly Building[] | undefined;
  value: string | null;
  onChange: (building: Building) => void;
  error?: string | undefined;
};

/**
 * Search, then tap one of the first six matches. The chosen building reads on its own
 * line and carries an ink check in the list; the last one used is preselected by the caller.
 */
export function BuildingPicker({ buildings, value, onChange, error }: Props) {
  const helpId = useId();
  const chosenId = useId();
  const [query, setQuery] = useState("");
  const chosen = buildings?.find((b) => b.id === value);
  const matches = buildings === undefined ? [] : matchBuildings(buildings, query).slice(0, SHOWN);
  return (
    <div className={`field${error === undefined ? "" : " field--error"}`}>
      {/* Offline there is no input, so the label must not point at one. */}
      {buildings === undefined ? (
        <p className="field__label">
          <Icon icon={Building2} size={16} />
          {t("new.building.label")}
        </p>
      ) : (
        <p className="field__label" aria-hidden="true">
          <Icon icon={Building2} size={16} />
          {t("new.building.label")}
        </p>
      )}
      {chosen === undefined ? null : (
        <p className="picked" id={chosenId}>
          {chosen.name}
        </p>
      )}
      {buildings === undefined ? (
        <p className="field__helper">{t("new.building.offline")}</p>
      ) : (
        <>
          <Search
            label={t("new.building.label")}
            placeholder={t("new.building.placeholder")}
            value={query}
            onChange={setQuery}
            describedBy={
              [chosen === undefined ? null : chosenId, error === undefined ? null : helpId]
                .filter((x) => x !== null)
                .join(" ") || undefined
            }
          />
          {query.trim() === "" ? null : matches.length === 0 ? (
            <p className="field__helper">{t("new.building.none")}</p>
          ) : (
            <ul className="row-list picker">
              {matches.map((b) => (
                <Row
                  key={b.id}
                  compact
                  title={b.name}
                  pressed={b.id === value}
                  lead={<Icon icon={Building2} />}
                  end={b.id === value ? <Icon icon={Check} className="picker__check" /> : undefined}
                  onClick={() => {
                    onChange(b);
                    setQuery("");
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}
      {error === undefined ? null : (
        <p className="field__error" id={helpId}>
          {error}
        </p>
      )}
    </div>
  );
}
