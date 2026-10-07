import {
  AMENITY,
  type Amenity,
  type Eligibility,
  SEAT_TYPE,
  type SeatType,
  TABLE_CONFIG,
  type TableConfig,
} from "@study-spot/core";
import { COPY, type SpotView, t } from "@study-spot/ui-logic";
import {
  AMENITY_COPY,
  CALLS_OPTIONS,
  CELL_OPTIONS,
  ELIGIBILITY_OPTIONS,
  ENTRY_OPTIONS,
  FOOD_OPTIONS,
  LIGHTING_OPTIONS,
  NOISE_OPTIONS,
  SEAT_TYPE_COPY,
  TABLE_COPY,
  TEMPERATURE_OPTIONS,
} from "../../lib/fields.ts";
import { Check } from "../../ui/Check.tsx";
import { OptionalChoice, TriState, YesNo } from "../../ui/Choices.tsx";
import { TextField } from "../../ui/Field.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { Stepper } from "../../ui/Stepper.tsx";
import { EditorShell, errorFor } from "./EditorShell.tsx";

type EditorProps = { view: SpotView };

/** Eligibility limited to one building, quad, or department asks which one. */
function scopeLabel(e: Eligibility | null): string | null {
  switch (e) {
    case "residents_building":
      return t("access.scope.label.building");
    case "residents_quad":
      return t("access.scope.label.quad");
    case "department":
      return t("access.scope.label.department");
    default:
      return null;
  }
}

export function AccessEditor({ view }: EditorProps) {
  return (
    <EditorShell section="access" view={view}>
      {({ form, set }) => {
        const v = form.values;
        const scope = scopeLabel(v.eligibility);
        return (
          <>
            <Segmented
              label={t("access.eligibility.label")}
              helper={t("access.eligibility.helper")}
              error={errorFor(form.errors, "eligibility")}
              layout="list"
              options={ELIGIBILITY_OPTIONS}
              value={v.eligibility}
              onChange={(x) => set("eligibility", x)}
            />
            {scope === null ? null : (
              <TextField
                label={scope}
                value={v.eligibility_scope ?? ""}
                onChange={(x) => set("eligibility_scope", x.trim() === "" ? null : x)}
                maxLength={200}
              />
            )}
            <Check
              label={t("access.verified.label")}
              helper={t("access.verified.helper")}
              checked={v.eligibility_verified === true}
              onChange={(x) => set("eligibility_verified", x)}
            />
            <OptionalChoice
              label={t("access.entry.label")}
              options={ENTRY_OPTIONS}
              value={v.entry_method}
              onChange={(x) => set("entry_method", x)}
            />
            <Check
              label={t("access.reservable.label")}
              checked={v.reservable === true}
              onChange={(x) => set("reservable", x)}
            />
            {v.reservable === true ? (
              <TextField
                label={t("access.reservation_url.label")}
                inputMode="url"
                value={v.reservation_url ?? ""}
                error={errorFor(
                  form.errors,
                  "reservation_url",
                  t("access.reservation_url.invalid"),
                )}
                onChange={(x) => set("reservation_url", x.trim() === "" ? null : x.trim())}
                maxLength={500}
              />
            ) : null}
          </>
        );
      }}
    </EditorShell>
  );
}

function toggle<T>(list: readonly T[], item: T, on: boolean): T[] {
  return on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item);
}

export function SeatingEditor({ view }: EditorProps) {
  return (
    <EditorShell section="seating" view={view}>
      {({ form, set }) => {
        const v = form.values;
        const types = v.seat_types ?? [];
        const tables = v.table_configs ?? [];
        return (
          <>
            <Stepper
              label={t("seating.seat_count.label")}
              helper={t("seating.seat_count.helper")}
              error={errorFor(form.errors, "seat_count", t("seating.seat_count.invalid"))}
              value={v.seat_count}
              min={1}
              onChange={(x) => set("seat_count", x)}
            />
            <fieldset className="field checks">
              <legend className="label field__label">{t("seating.types.label")}</legend>
              {SEAT_TYPE.map((type: SeatType) => (
                <Check
                  key={type}
                  label={COPY[SEAT_TYPE_COPY[type]]}
                  checked={types.some((s) => s.type === type)}
                  onChange={(on) =>
                    set(
                      "seat_types",
                      on
                        ? [...types.filter((s) => s.type !== type), { type, count: 0 }]
                        : types.filter((s) => s.type !== type),
                    )
                  }
                />
              ))}
            </fieldset>
            <fieldset className="field checks">
              <legend className="label field__label">{t("seating.tables.label")}</legend>
              {TABLE_CONFIG.map((c: TableConfig) => (
                <Check
                  key={c}
                  label={COPY[TABLE_COPY[c]]}
                  checked={tables.includes(c)}
                  onChange={(on) => set("table_configs", toggle(tables, c, on))}
                />
              ))}
            </fieldset>
            <Stepper
              label={t("seating.max_group.label")}
              value={v.max_group_size}
              min={1}
              max={200}
              onChange={(x) => set("max_group_size", x)}
            />
            <TriState
              label={t("seating.spread_out.label")}
              value={v.spread_out_room}
              onChange={(x) => set("spread_out_room", x)}
            />
          </>
        );
      }}
    </EditorShell>
  );
}

export function PowerEditor({ view }: EditorProps) {
  return (
    <EditorShell section="power" view={view}>
      {({ form, set }) => {
        const v = form.values;
        return (
          <>
            <Stepper
              label={t("power.outlets.label")}
              helper={t("power.outlets.helper")}
              error={errorFor(form.errors, "outlet_coverage_pct")}
              value={
                v.outlet_coverage_pct === null ? null : Math.round(v.outlet_coverage_pct * 100)
              }
              min={0}
              max={100}
              step={10}
              suffix={t("unit.percent")}
              onChange={(x) => set("outlet_coverage_pct", x === null ? null : x / 100)}
            />
            <TriState
              label={t("power.usb.label")}
              value={v.usb_outlets}
              onChange={(x) => set("usb_outlets", x)}
            />
            <TextField
              label={t("power.wifi.label")}
              helper={t("power.wifi.helper")}
              inputMode="decimal"
              value={v.wifi_mbps === null ? "" : String(v.wifi_mbps)}
              onChange={(x) => {
                const n = Number(x.replace(",", "."));
                set("wifi_mbps", x.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n);
              }}
              maxLength={8}
            />
            <OptionalChoice
              label={t("power.cell.label")}
              options={CELL_OPTIONS}
              value={v.cell_signal}
              onChange={(x) => set("cell_signal", x)}
            />
          </>
        );
      }}
    </EditorShell>
  );
}

export function EnvironmentEditor({ view }: EditorProps) {
  return (
    <EditorShell section="environment" view={view}>
      {({ form, set }) => {
        const v = form.values;
        return (
          <>
            <Segmented
              label={t("env.noise.label")}
              helper={t("env.noise.helper")}
              error={errorFor(form.errors, "noise_policy")}
              layout="list"
              options={NOISE_OPTIONS}
              value={v.noise_policy}
              onChange={(x) => set("noise_policy", x)}
            />
            <TriState
              label={t("env.light.natural")}
              value={v.natural_light}
              onChange={(x) => set("natural_light", x)}
            />
            <OptionalChoice
              label={t("env.lighting.label")}
              options={LIGHTING_OPTIONS}
              value={v.lighting}
              onChange={(x) => set("lighting", x)}
            />
            <OptionalChoice
              label={t("env.temperature.label")}
              options={TEMPERATURE_OPTIONS}
              value={v.temperature}
              onChange={(x) => set("temperature", x)}
            />
            <TriState
              label={t("env.temperature_consistent.label")}
              value={v.temperature_consistent}
              onChange={(x) => set("temperature_consistent", x)}
            />
            <TriState
              label={t("env.windows.label")}
              value={v.windows_view}
              onChange={(x) => set("windows_view", x)}
            />
          </>
        );
      }}
    </EditorShell>
  );
}

export function UseFitEditor({ view }: EditorProps) {
  return (
    <EditorShell section="use_fit" view={view}>
      {({ form, set }) => {
        const v = form.values;
        return (
          <>
            <Segmented
              label={t("use.food.label")}
              error={errorFor(form.errors, "food_policy")}
              options={FOOD_OPTIONS}
              value={v.food_policy}
              onChange={(x) => set("food_policy", x)}
            />
            <YesNo
              label={t("use.group.label")}
              helper={t("use.group.helper")}
              error={errorFor(form.errors, "group_work_ok")}
              value={v.group_work_ok}
              onChange={(x) => set("group_work_ok", x)}
            />
            <OptionalChoice
              label={t("use.calls.label")}
              layout="list"
              options={CALLS_OPTIONS}
              value={v.calls_ok}
              onChange={(x) => set("calls_ok", x)}
            />
            <TriState
              label={t("use.whiteboard.label")}
              value={v.whiteboard}
              onChange={(x) => set("whiteboard", x)}
            />
          </>
        );
      }}
    </EditorShell>
  );
}

export function AmenitiesEditor({ view }: EditorProps) {
  return (
    <EditorShell section="amenities" view={view}>
      {({ form, set }) => {
        const list = form.values.amenities ?? [];
        const minutes = (a: Amenity) => list.find((x) => x.amenity === a)?.walk_minutes ?? null;
        return (
          <>
            <p className="lede">{t("amenity.helper")}</p>
            {AMENITY.map((a: Amenity) => (
              <Stepper
                key={a}
                label={COPY[AMENITY_COPY[a]]}
                value={minutes(a)}
                min={0}
                max={60}
                suffix={t("unit.minutes")}
                onChange={(x) =>
                  set(
                    "amenities",
                    x === null
                      ? list.filter((y) => y.amenity !== a)
                      : [...list.filter((y) => y.amenity !== a), { amenity: a, walk_minutes: x }],
                  )
                }
              />
            ))}
          </>
        );
      }}
    </EditorShell>
  );
}

export function AccessibilityEditor({ view }: EditorProps) {
  return (
    <EditorShell section="accessibility" view={view}>
      {({ form, set }) => (
        <>
          <TriState
            label={t("a11y.step_free")}
            value={form.values.step_free}
            onChange={(x) => set("step_free", x)}
          />
          <TriState
            label={t("a11y.elevator")}
            value={form.values.elevator}
            onChange={(x) => set("elevator", x)}
          />
          <TriState
            label={t("a11y.seating")}
            value={form.values.accessible_seating}
            onChange={(x) => set("accessible_seating", x)}
          />
        </>
      )}
    </EditorShell>
  );
}

export function LateNightEditor({ view }: EditorProps) {
  return (
    <EditorShell section="late_night" view={view}>
      {({ form, set }) => (
        <>
          <TriState
            label={t("late.past_midnight")}
            value={form.values.open_past_midnight}
            onChange={(x) => set("open_past_midnight", x)}
          />
          <TriState
            label={t("late.staffed")}
            value={form.values.staffed_late}
            onChange={(x) => set("staffed_late", x)}
          />
          <TriState
            label={t("late.lit_route")}
            value={form.values.lit_route_to_residences}
            onChange={(x) => set("lit_route_to_residences", x)}
          />
        </>
      )}
    </EditorShell>
  );
}
