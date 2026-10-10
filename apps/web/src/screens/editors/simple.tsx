import {
  AMENITY,
  type Amenity,
  type Eligibility,
  SEAT_TYPE,
  type SeatType,
  TABLE_CONFIG,
  type TableConfig,
} from "@perch/core";
import { type SpotView, t } from "@perch/ui-logic";
import {
  Accessibility,
  AppWindow,
  Armchair,
  ArrowUpDown,
  CalendarClock,
  Expand,
  KeyRound,
  Lamp,
  LayoutGrid,
  Lightbulb,
  Moon,
  Phone,
  Plug,
  Presentation,
  Signal,
  Sun,
  Table,
  Thermometer,
  ThermometerSun,
  Usb,
  UserCheck,
  Users,
  Utensils,
  Volume2,
  Wifi,
} from "lucide-react";
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
import { AMENITY_ICON, SEAT_TYPE_ICON, TABLE_ICON } from "../../lib/icons.ts";
import { Check, TagGroup } from "../../ui/Check.tsx";
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
              icon={Users}
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
              icon={KeyRound}
              options={ENTRY_OPTIONS}
              value={v.entry_method}
              onChange={(x) => set("entry_method", x)}
            />
            <Check
              label={t("access.reservable.label")}
              icon={CalendarClock}
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
              icon={Armchair}
              helper={t("seating.seat_count.helper")}
              error={errorFor(form.errors, "seat_count", t("seating.seat_count.invalid"))}
              value={v.seat_count}
              min={1}
              onChange={(x) => set("seat_count", x)}
            />
            <TagGroup label={t("seating.types.label")} icon={LayoutGrid}>
              {SEAT_TYPE.map((type: SeatType) => (
                <Check
                  key={type}
                  variant="tag"
                  label={t(SEAT_TYPE_COPY[type])}
                  icon={SEAT_TYPE_ICON[type]}
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
            </TagGroup>
            <TagGroup label={t("seating.tables.label")} icon={Table}>
              {TABLE_CONFIG.map((c: TableConfig) => (
                <Check
                  key={c}
                  variant="tag"
                  label={t(TABLE_COPY[c])}
                  icon={TABLE_ICON[c]}
                  checked={tables.includes(c)}
                  onChange={(on) => set("table_configs", toggle(tables, c, on))}
                />
              ))}
            </TagGroup>
            <Stepper
              label={t("seating.max_group.label")}
              icon={Users}
              value={v.max_group_size}
              min={1}
              max={200}
              onChange={(x) => set("max_group_size", x)}
            />
            <TriState
              label={t("seating.spread_out.label")}
              icon={Expand}
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
              icon={Plug}
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
              icon={Usb}
              value={v.usb_outlets}
              onChange={(x) => set("usb_outlets", x)}
            />
            <TextField
              label={t("power.wifi.label")}
              icon={Wifi}
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
              icon={Signal}
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
              icon={Volume2}
              helper={t("env.noise.helper")}
              error={errorFor(form.errors, "noise_policy")}
              layout="list"
              options={NOISE_OPTIONS}
              value={v.noise_policy}
              onChange={(x) => set("noise_policy", x)}
            />
            <TriState
              label={t("env.light.natural")}
              icon={Sun}
              value={v.natural_light}
              onChange={(x) => set("natural_light", x)}
            />
            <OptionalChoice
              label={t("env.lighting.label")}
              icon={Lamp}
              options={LIGHTING_OPTIONS}
              value={v.lighting}
              onChange={(x) => set("lighting", x)}
            />
            <OptionalChoice
              label={t("env.temperature.label")}
              icon={Thermometer}
              options={TEMPERATURE_OPTIONS}
              value={v.temperature}
              onChange={(x) => set("temperature", x)}
            />
            <TriState
              label={t("env.temperature_consistent.label")}
              icon={ThermometerSun}
              value={v.temperature_consistent}
              onChange={(x) => set("temperature_consistent", x)}
            />
            <TriState
              label={t("env.windows.label")}
              icon={AppWindow}
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
              icon={Utensils}
              error={errorFor(form.errors, "food_policy")}
              options={FOOD_OPTIONS}
              value={v.food_policy}
              onChange={(x) => set("food_policy", x)}
            />
            <YesNo
              label={t("use.group.label")}
              icon={Users}
              helper={t("use.group.helper")}
              error={errorFor(form.errors, "group_work_ok")}
              value={v.group_work_ok}
              onChange={(x) => set("group_work_ok", x)}
            />
            <OptionalChoice
              label={t("use.calls.label")}
              icon={Phone}
              layout="list"
              options={CALLS_OPTIONS}
              value={v.calls_ok}
              onChange={(x) => set("calls_ok", x)}
            />
            <TriState
              label={t("use.whiteboard.label")}
              icon={Presentation}
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
                label={t(AMENITY_COPY[a])}
                icon={AMENITY_ICON[a]}
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
            icon={Accessibility}
            value={form.values.step_free}
            onChange={(x) => set("step_free", x)}
          />
          <TriState
            label={t("a11y.elevator")}
            icon={ArrowUpDown}
            value={form.values.elevator}
            onChange={(x) => set("elevator", x)}
          />
          <TriState
            label={t("a11y.seating")}
            icon={Armchair}
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
            icon={Moon}
            value={form.values.open_past_midnight}
            onChange={(x) => set("open_past_midnight", x)}
          />
          <TriState
            label={t("late.staffed")}
            icon={UserCheck}
            value={form.values.staffed_late}
            onChange={(x) => set("staffed_late", x)}
          />
          <TriState
            label={t("late.lit_route")}
            icon={Lightbulb}
            value={form.values.lit_route_to_residences}
            onChange={(x) => set("lit_route_to_residences", x)}
          />
        </>
      )}
    </EditorShell>
  );
}
