import { isLocalId, type SpotView, t } from "@perch/ui-logic";
import { Layers, Signpost, Snowflake, Tag, Trees, Type } from "lucide-react";
import { useState } from "react";
import { useCampus } from "../../hooks/useQueries.ts";
import { type LocationState, spotPoint } from "../../lib/location.ts";
import { spotSlug } from "../../lib/slug.ts";
import { Check } from "../../ui/Check.tsx";
import { TextField } from "../../ui/Field.tsx";
import { BuildingPicker } from "../BuildingPicker.tsx";
import { LocationButton } from "../LocationButton.tsx";
import { EditorShell, errorFor } from "./EditorShell.tsx";

/**
 * Basics. A draft still only on this phone takes a new slug from its name (a
 * refused create is fixed here, e.g. slug_taken); a spot on the server keeps
 * its slug so student links stay put.
 */
export function IdentityEditor({ view }: { view: SpotView }) {
  const campus = useCampus();
  const [location, setLocation] = useState<LocationState>({ kind: "idle" });
  const local = isLocalId(view.spot.id);
  return (
    <EditorShell section="identity" view={view}>
      {({ form, set }) => {
        const v = form.values;
        const rename = (name: string) => {
          set("official_name", name);
          if (local && v.building_id !== null) set("slug", spotSlug(name.trim(), v.building_id));
        };
        return (
          <>
            <TextField
              label={t("new.official_name.label")}
              icon={Type}
              helper={t("new.official_name.helper")}
              error={errorFor(form.errors, "official_name")}
              value={v.official_name ?? ""}
              onChange={rename}
              maxLength={200}
            />
            <TextField
              label={t("new.common_name.label")}
              icon={Tag}
              optional={t("common.optional")}
              value={v.common_name ?? ""}
              onChange={(x) => set("common_name", x.trim() === "" ? null : x)}
              maxLength={200}
            />
            <BuildingPicker
              buildings={campus.data?.buildings}
              value={v.building_id}
              error={errorFor(form.errors, "building_id")}
              onChange={(b) => {
                set("building_id", b.id);
                const point = spotPoint(location, b);
                set("lat", point.lat);
                set("lng", point.lng);
                if (local && v.official_name !== null)
                  set("slug", spotSlug(v.official_name.trim(), b.id));
              }}
            />
            <TextField
              label={t("new.floor.label")}
              icon={Layers}
              helper={t("new.floor.helper")}
              error={errorFor(form.errors, "floor")}
              value={v.floor ?? ""}
              onChange={(x) => set("floor", x)}
              maxLength={20}
            />
            <LocationButton
              state={location}
              onChange={(next) => {
                setLocation(next);
                if (next.kind === "fix") {
                  const point = spotPoint(next, {
                    lat: v.lat ?? next.fix.lat,
                    lng: v.lng ?? next.fix.lng,
                  });
                  set("lat", point.lat);
                  set("lng", point.lng);
                }
              }}
            />
            <TextField
              label={t("new.directions.label")}
              icon={Signpost}
              helper={t("new.directions.helper")}
              placeholder={t("new.directions.placeholder")}
              value={v.directions ?? ""}
              onChange={(x) => set("directions", x.trim() === "" ? null : x)}
              multiline
              maxLength={2000}
            />
            <Check
              label={t("identity.outdoor.label")}
              icon={Trees}
              checked={v.outdoor === true}
              onChange={(x) => set("outdoor", x)}
            />
            <Check
              label={t("identity.seasonal.label")}
              icon={Snowflake}
              checked={v.seasonal === true}
              onChange={(x) => set("seasonal", x)}
            />
          </>
        );
      }}
    </EditorShell>
  );
}
