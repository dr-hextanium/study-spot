import type { BundleBuilding } from "@perch/core";
import { nearestBuilding, t } from "@perch/ui-logic";
import { Building2, LocateFixed } from "lucide-react";
import { useState } from "react";
import { useDeps } from "../../app/AppProvider.tsx";
import { Button } from "../../ui/Button.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { BuildingSheet } from "./BuildingSheet.tsx";

const SHOWN = 8;

type Status =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "denied" }
  | { kind: "imprecise" }
  | { kind: "far" }
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
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const sorted = [...props.buildings].sort((a, b) => a.name.localeCompare(b.name));

  async function locate() {
    setStatus({ kind: "pending" });
    const fix = await geolocation.current();
    if (fix === null) {
      setStatus({ kind: "denied" });
      return;
    }
    const near = nearestBuilding(props.buildings, fix);
    if (near.kind === "rough") {
      setStatus({ kind: "imprecise" });
      return;
    }
    // Off campus: a far-away building would be a wrong walk, so the From stays.
    if (near.kind === "far") {
      setStatus({ kind: "far" });
      return;
    }
    props.onChoose(near.building.id);
    setStatus({ kind: "located", name: near.building.name });
  }

  const close = () => {
    setStatus({ kind: "idle" });
    props.onClose();
  };

  return (
    <BuildingSheet
      open={props.open}
      title={t("student.home.from.sheet")}
      buildings={sorted}
      value={props.value}
      searchLabel={t("student.home.from.search")}
      alwaysSearch
      limit={SHOWN}
      emptyText={t("student.home.from.none")}
      icon={Building2}
      onPick={(id) => {
        if (id === null) return;
        props.onChoose(id);
        close();
      }}
      onClose={close}
    >
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
              : status.kind === "far"
                ? t("student.home.from.far")
                : status.kind === "located"
                  ? t("student.home.from.located", { building: status.name })
                  : ""}
        </p>
      </div>
    </BuildingSheet>
  );
}
