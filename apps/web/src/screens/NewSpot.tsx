import type { IdentitySection } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { useNavigate } from "@tanstack/react-router";
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
import { SurveyHeader } from "./SurveyHeader.tsx";

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
    const known = new Set(outbox.getSnapshot().records.map((r) => r.client_write_id));
    let id: string;
    try {
      id = await outbox.createSpot(identity);
    } catch {
      // A storage timeout does not say whether the draft landed. Reload the queue and
      // look for it before offering another try, or a retry makes a duplicate draft.
      await outbox.reload().catch(() => undefined);
      const landed = outbox
        .getSnapshot()
        .records.find(
          (r) =>
            r.kind === "spot.create" &&
            !known.has(r.client_write_id) &&
            r.payload.identity.slug === identity.slug,
        );
      if (landed === undefined) {
        setSaving(false);
        setSaveFailed(true);
        return;
      }
      id = landed.spot_id;
    }
    await navigate({ to: "/survey/spots/$id", params: { id }, replace: true });
  }

  return (
    <>
      <SurveyHeader title={t("new.title")} back={{ to: "/survey" }} />
      <Screen
        action={
          <>
            {saveFailed ? (
              <p className="pinned__note" role="alert">
                {t("common.save_failed")}
              </p>
            ) : null}
            {ready ? null : <p className="pinned__note">{t("new.blocked")}</p>}
            <Button
              variant="primary"
              wide
              disabled={!ready || saving}
              onClick={() => void create()}
            >
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
          value={floor}
          onChange={setFloor}
          maxLength={20}
        />
        <TextField
          label={t("new.official_name.label")}
          helper={t("new.official_name.helper")}
          value={name}
          onChange={setName}
          maxLength={200}
        />
        <TextField
          label={t("new.common_name.label")}
          optional={t("common.optional")}
          value={commonName}
          onChange={setCommonName}
          maxLength={200}
        />
        <LocationButton state={location} onChange={setLocation} />
        <TextField
          label={t("new.directions.label")}
          helper={t("new.directions.helper")}
          placeholder={t("new.directions.placeholder")}
          value={directions}
          onChange={setDirections}
          multiline
          maxLength={2000}
        />
      </Screen>
    </>
  );
}
