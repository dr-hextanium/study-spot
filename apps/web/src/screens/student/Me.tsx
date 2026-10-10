import { type AccessProfile, BUILTIN_PRESETS, type Preset } from "@perch/core";
import {
  deleteCustomPreset,
  quadOptions,
  readAccess,
  readCustomPresets,
  residenceOptions,
  saveCustomPreset,
  t,
  writeAccess,
} from "@perch/ui-logic";
import { ExternalLink, Plus, Trash2, Wrench } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { useDeps } from "../../app/AppProvider.tsx";
import { useBundle } from "../../hooks/useBundle.ts";
import { Banner } from "../../ui/Banner.tsx";
import { Button, IconButton } from "../../ui/Button.tsx";
import { Check } from "../../ui/Check.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Row } from "../../ui/Row.tsx";
import { GroupHeading, Screen } from "../../ui/Screen.tsx";
import { ConfirmSheet } from "../../ui/Sheet.tsx";
import { ThemeSwitch } from "../../ui/ThemeSwitch.tsx";
import { BuildingSheet } from "./BuildingSheet.tsx";
import { PresetSheet } from "./PresetSheet.tsx";

const REPO = "https://github.com/dr-hextanium/perch";
const LICENSES = `${REPO}/blob/main/LICENSE`;

/** Names a built-in preset from the copy deck (built-ins carry no name). */
function builtinName(id: Preset["id"]): string {
  switch (id) {
    case "silent_solo":
      return t("student.preset.silent_solo");
    case "group":
      return t("student.preset.group");
    case "calls":
      return t("student.preset.calls");
    case "late_night":
      return t("student.preset.late_night");
    case "quick_30":
      return t("student.preset.quick_30");
    default:
      return id;
  }
}

/**
 * Me: what this phone knows about you (where you live, your presets, the theme). It all
 * lives in localStorage; nothing here goes to a server. A surveyor session adds one row.
 */
export function Me() {
  const { prefs, ids, session } = useDeps();
  const bundle = useBundle();
  const buildings = bundle.phase === "ready" ? bundle.load.bundle.buildings : null;
  const surveyor = useSyncExternalStore(session.subscribe, session.token) !== null;

  // Read once: a corrupt value is dropped on read, so a second read would not say so.
  const [initial] = useState(() => ({
    access: readAccess(prefs),
    presets: readCustomPresets(prefs),
  }));
  const [access, setAccess] = useState<AccessProfile>(initial.access.value);
  const [custom, setCustom] = useState<Preset[]>(initial.presets.value);
  const [sheet, setSheet] = useState<"residence" | "quad" | "preset" | null>(null);
  const [removing, setRemoving] = useState<Preset | null>(null);

  const update = (next: AccessProfile): void => {
    setAccess(next);
    writeAccess(prefs, next);
  };
  const nameOf = (id: string | null): string | null =>
    id === null ? null : (buildings?.find((b) => b.id === id)?.name ?? null);

  return (
    <Screen title={t("student.me.title")}>
      {initial.access.reset || initial.presets.reset ? (
        <Banner tone="note">{t("student.me.reset_note")}</Banner>
      ) : null}

      <section aria-labelledby="me-access">
        <GroupHeading id="me-access">{t("student.me.access_heading")}</GroupHeading>
        <ul className="row-list">
          <Row
            title={t("student.me.residence.label")}
            end={nameOf(access.residence) ?? t("student.me.residence.none")}
            disabled={buildings === null}
            onClick={() => setSheet("residence")}
          />
          <Row
            title={t("student.me.quad.label")}
            end={nameOf(access.quad) ?? t("student.me.quad.none")}
            disabled={buildings === null}
            onClick={() => setSheet("quad")}
          />
        </ul>
        <Check
          label={t("student.me.grad.label")}
          checked={access.grad}
          onChange={(grad) => update({ ...access, grad })}
        />
        <p className="lede">{t("student.me.access_helper")}</p>
      </section>

      <section aria-labelledby="me-presets">
        <GroupHeading id="me-presets">{t("student.me.presets_heading")}</GroupHeading>
        <ul className="row-list">
          {BUILTIN_PRESETS.map((p) => (
            <Row key={p.id} title={builtinName(p.id)} sub={t("student.me.preset.builtin")} />
          ))}
          {custom.map((p) => (
            <Row
              key={p.id}
              title={p.name ?? p.id}
              end={
                <IconButton
                  label={t("student.me.preset.delete")}
                  icon={Trash2}
                  onClick={() => setRemoving(p)}
                />
              }
            />
          ))}
        </ul>
        <div className="inline-action">
          <Button variant="quiet" icon={<Icon icon={Plus} />} onClick={() => setSheet("preset")}>
            {t("student.me.preset.new")}
          </Button>
        </div>
      </section>

      <section aria-labelledby="me-look">
        <GroupHeading id="me-look">{t("student.me.look_heading")}</GroupHeading>
        <ThemeSwitch />
      </section>

      <section aria-labelledby="me-privacy">
        <GroupHeading id="me-privacy">{t("student.me.privacy_heading")}</GroupHeading>
        <p className="lede">{t("student.me.privacy")}</p>
        <ul className="row-list">
          <Row title={t("student.me.data_policy")} link={{ to: "/data-policy" }} />
          <Row
            title={t("student.me.source")}
            href={REPO}
            end={<Icon icon={ExternalLink} size={16} />}
          />
          <Row
            title={t("student.me.licenses")}
            href={LICENSES}
            end={<Icon icon={ExternalLink} size={16} />}
          />
        </ul>
        <p className="lede">{t("student.me.licenses_body")}</p>
      </section>

      {surveyor ? (
        <section>
          <ul className="row-list">
            <Row
              title={t("student.me.surveyor")}
              lead={<Icon icon={Wrench} />}
              link={{ to: "/survey" }}
            />
          </ul>
        </section>
      ) : null}

      {buildings === null ? null : (
        <>
          <BuildingSheet
            open={sheet === "residence"}
            title={t("student.me.residence.label")}
            buildings={residenceOptions(buildings)}
            value={access.residence}
            noneLabel={t("student.me.residence.none")}
            onPick={(residence) => {
              update({ ...access, residence });
              setSheet(null);
            }}
            onClose={() => setSheet(null)}
          />
          <BuildingSheet
            open={sheet === "quad"}
            title={t("student.me.quad.label")}
            buildings={quadOptions(buildings)}
            value={access.quad}
            noneLabel={t("student.me.quad.none")}
            onPick={(quad) => {
              update({ ...access, quad });
              setSheet(null);
            }}
            onClose={() => setSheet(null)}
          />
        </>
      )}
      <PresetSheet
        open={sheet === "preset"}
        onSave={(input) => {
          const result = saveCustomPreset(prefs, custom, input, ids);
          if (result.ok) setCustom(result.list);
          return result;
        }}
        onClose={() => setSheet(null)}
      />
      <ConfirmSheet
        open={removing !== null}
        title={t("student.me.preset.delete_title", { name: removing?.name ?? "" })}
        body={t("student.me.preset.delete_body")}
        action={t("student.me.preset.delete")}
        cancel={t("common.cancel")}
        destructive
        onConfirm={() => {
          if (removing !== null) setCustom(deleteCustomPreset(prefs, custom, removing.id));
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </Screen>
  );
}
