import type { BundleBuilding } from "@perch/core";
import { nearestBuilding, t } from "@perch/ui-logic";
import { Building2, Check, LocateFixed } from "lucide-react";
import { useState } from "react";
import { useDeps } from "../../app/AppProvider.tsx";
import { Button } from "../../ui/Button.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Row } from "../../ui/Row.tsx";
import { Search } from "../../ui/Search.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { matchBuildings } from "../BuildingPicker.tsx";

const SHOWN = 8;

type Status =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "denied" }
  | { kind: "imprecise" }
  | { kind: "located"; name: string };

/**
 * Where the walk starts: one tap on Use my location, or a building from the list. The fix
 * lives only inside the click handler: it is snapped to a building id and dropped there.
 */
export function FromSheet(props: {
  open: boolean;
  buildings: readonly BundleBuilding[];
  value: string | null;
  onChoose: (buildingId: string) => void;
  onClose: () => void;
}) {
  const { geolocation } = useDeps();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const sorted = [...props.buildings].sort((a, b) => a.name.localeCompare(b.name));
  const matches = matchBuildings(sorted, query).slice(0, SHOWN);
  const chosen = sorted.find((b) => b.id === props.value);
  // The chosen building stays in view with its check, even past the first eight.
  const list =
    query.trim() === "" && chosen !== undefined && !matches.includes(chosen)
      ? [chosen, ...matches.slice(0, SHOWN - 1)]
      : matches;

  async function locate() {
    setStatus({ kind: "pending" });
    const fix = await geolocation.current();
    if (fix === null) {
      setStatus({ kind: "denied" });
      return;
    }
    const building = nearestBuilding(props.buildings, fix);
    if (building === null) {
      setStatus({ kind: "imprecise" });
      return;
    }
    props.onChoose(building.id);
    setStatus({ kind: "located", name: building.name });
  }

  const close = () => {
    setQuery("");
    setStatus({ kind: "idle" });
    props.onClose();
  };

  return (
    <Sheet open={props.open} title={t("student.home.from.sheet")} onClose={close}>
      <div className="field">
        <Button
          variant="ghost"
          icon={<Icon icon={LocateFixed} />}
          disabled={status.kind === "pending"}
          onClick={() => void locate()}
        >
          {status.kind === "pending"
            ? t("student.home.from.locating")
            : t("student.home.from.locate")}
        </Button>
        <p className="field__helper">{t("student.home.from.privacy")}</p>
        <p className="picked" aria-live="polite">
          {status.kind === "denied"
            ? t("student.home.from.denied")
            : status.kind === "imprecise"
              ? t("student.home.from.imprecise")
              : status.kind === "located"
                ? t("student.home.from.located", { building: status.name })
                : ""}
        </p>
      </div>
      <Search label={t("student.home.from.search")} value={query} onChange={setQuery} />
      {list.length === 0 ? (
        <p className="empty">{t("student.home.from.none")}</p>
      ) : (
        <ul className="row-list picker">
          {list.map((b) => (
            <Row
              key={b.id}
              compact
              title={b.name}
              pressed={b.id === props.value}
              lead={<Icon icon={Building2} />}
              end={
                b.id === props.value ? <Icon icon={Check} className="picker__check" /> : undefined
              }
              onClick={() => {
                props.onChoose(b.id);
                close();
              }}
            />
          ))}
        </ul>
      )}
    </Sheet>
  );
}
