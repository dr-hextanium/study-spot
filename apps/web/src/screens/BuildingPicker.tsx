import type { CampusInfo } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { useId, useState } from "react";

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
 * Search, then tap one of the first six matches. The chosen building reads in
 * ballpoint blue on the line; the last one used is preselected by the caller.
 */
export function BuildingPicker({ buildings, value, onChange, error }: Props) {
  const inputId = useId();
  const helpId = useId();
  const chosenId = useId();
  const [query, setQuery] = useState("");
  const chosen = buildings?.find((b) => b.id === value);
  const matches = buildings === undefined ? [] : matchBuildings(buildings, query).slice(0, SHOWN);
  return (
    <div className={`field${error === undefined ? "" : " field--error"}`}>
      {/* Offline there is no input, so the label must not point at one. */}
      {buildings === undefined ? (
        <p className="label field__label">{t("new.building.label")}</p>
      ) : (
        <label className="label field__label" htmlFor={inputId}>
          {t("new.building.label")}
        </label>
      )}
      {chosen === undefined ? null : (
        <p className="entered" id={chosenId}>
          {chosen.name}
        </p>
      )}
      {buildings === undefined ? (
        <p className="field__helper">{t("new.building.offline")}</p>
      ) : (
        <>
          <input
            id={inputId}
            className="input"
            type="search"
            value={query}
            placeholder={t("new.building.placeholder")}
            autoComplete="off"
            aria-describedby={
              [chosen === undefined ? null : chosenId, error === undefined ? null : helpId]
                .filter((x) => x !== null)
                .join(" ") || undefined
            }
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          {query.trim() === "" ? null : matches.length === 0 ? (
            <p className="field__helper">{t("new.building.none")}</p>
          ) : (
            <ul className="ruled-list picker">
              {matches.map((b) => (
                <li key={b.id} className="ruled">
                  <button
                    type="button"
                    className="picker__option"
                    aria-pressed={b.id === value}
                    onClick={() => {
                      onChange(b);
                      setQuery("");
                    }}
                  >
                    {b.name}
                  </button>
                </li>
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
