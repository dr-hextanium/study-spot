import type { IdentitySection } from "@perch/core";
import { localIdFor, t } from "@perch/ui-logic";
import { useNavigate } from "@tanstack/react-router";
import { Layers, Signpost, Tag, Type } from "lucide-react";
import { useState } from "react";
import { useDeps } from "../app/AppProvider.tsx";
import { useCampus } from "../hooks/useQueries.ts";
import { type LocationState, spotPoint } from "../lib/location.ts";
import { spotSlug } from "../lib/slug.ts";
import { Button } from "../ui/Button.tsx";
import { TextField } from "../ui/Field.tsx";
import { Screen } from "../ui/Screen.tsx";
import { BuildingPicker, LAST_BUILDING_KEY } from "./BuildingPicker.tsx";
import { LocationButton } from "./LocationButton.tsx";
import { SyncStatus } from "./SyncStatus.tsx";

function lastBuilding(): string | null {
  try {
    return localStorage.getItem(LAST_BUILDING_KEY);
  } catch {
    return null;
  }
}

function rememberBuilding(id: string): void {
  try {
    localStorage.setItem(LAST_BUILDING_KEY, id);
  } catch {
    // Remembering is a convenience; the picker still works without it.
  }
}

/** Identity only: the minimum to make a draft, saved on the phone at once (journey B2). */
export function NewSpot() {
  const { outbox } = useDeps();
  const campus = useCampus();
  const navigate = useNavigate();
  const buildings = campus.data?.buildings;
  const [buildingId, setBuildingId] = useState<string | null>(lastBuilding);
  const [floor, setFloor] = useState("");
  const [name, setName] = useState("");
  const [commonName, setCommonName] = useState("");
  const [directions, setDirections] = useState("");
  const [location, setLocation] = useState<LocationState>({ kind: "idle" });
  // One id per submit: a retry after a failed save sends the same one, so it cannot double up.
  const [submitKey, setSubmitKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const building = buildings?.find((b) => b.id === buildingId);
  const ready = building !== undefined && floor.trim() !== "" && name.trim() !== "";

  async function create() {
    if (building === undefined || !ready) return;
    setSaving(true);
    const identity: IdentitySection = {
      slug: spotSlug(name.trim(), building.id),
      official_name: name.trim(),
      common_name: commonName.trim() === "" ? null : commonName.trim(),
      building_id: building.id,
      floor: floor.trim(),
      ...spotPoint(location, building),
      directions: directions.trim() === "" ? null : directions.trim(),
      outdoor: false,
      seasonal: false,
    };
    rememberBuilding(building.id);
    setSaveFailed(false);
    let id: string;
    try {
      id = await outbox.createSpot(identity, submitKey);
    } catch {
      // A storage timeout does not say whether the draft landed. Reload the queue and look
      // for this submit's id; if it is missing, trying again is safe because the same id is
      // sent, so a draft that did land is never made twice.
      await outbox.reload().catch(() => undefined);
      const snap = outbox.getSnapshot();
      const lid = localIdFor(submitKey);
      if (!snap.records.some((r) => r.spot_id === lid) && snap.idMap[lid] === undefined) {
        setSaving(false);
        setSaveFailed(true);
        return;
      }
      id = lid;
    }
    setSubmitKey(crypto.randomUUID());
    await navigate({ to: "/survey/spots/$id", params: { id }, replace: true });
  }

  return (
    <Screen
      title={t("new.title")}
      back={{ to: "/survey" }}
      trailing={<SyncStatus variant="icon" />}
      stacked
      action={
        <>
          {saveFailed ? (
            <p className="actionbar__note" role="alert">
              {t("common.save_failed")}
            </p>
          ) : null}
          {ready ? null : <p className="actionbar__note">{t("new.blocked")}</p>}
          <Button variant="primary" wide disabled={!ready || saving} onClick={() => void create()}>
            {t("new.save")}
          </Button>
        </>
      }
    >
      <BuildingPicker
        buildings={buildings}
        value={buildingId}
        onChange={(b) => setBuildingId(b.id)}
      />
      <TextField
        label={t("new.floor.label")}
        helper={t("new.floor.helper")}
        icon={Layers}
        value={floor}
        onChange={setFloor}
        maxLength={20}
      />
      <TextField
        label={t("new.official_name.label")}
        helper={t("new.official_name.helper")}
        icon={Type}
        value={name}
        onChange={setName}
        maxLength={200}
      />
      <TextField
        label={t("new.common_name.label")}
        optional={t("common.optional")}
        icon={Tag}
        value={commonName}
        onChange={setCommonName}
        maxLength={200}
      />
      <LocationButton state={location} onChange={setLocation} />
      <TextField
        label={t("new.directions.label")}
        helper={t("new.directions.helper")}
        placeholder={t("new.directions.placeholder")}
        icon={Signpost}
        value={directions}
        onChange={setDirections}
        multiline
        maxLength={2000}
      />
    </Screen>
  );
}
