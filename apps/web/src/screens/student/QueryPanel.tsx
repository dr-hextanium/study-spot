import type { BuiltinPresetId, Preset, TimeChoice } from "@perch/core";
import { type PlainCopyId, t } from "@perch/ui-logic";
import { BookOpen, ChevronRight, Clock, MapPin, SlidersHorizontal, Users } from "lucide-react";
import { useState } from "react";
import type { QuickPick } from "../../hooks/useQuickPick.ts";
import { Button } from "../../ui/Button.tsx";
import { FilterChips } from "../../ui/FilterChips.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Row } from "../../ui/Row.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { Stepper } from "../../ui/Stepper.tsx";
import { FiltersSheet } from "./FiltersSheet.tsx";
import { FromSheet } from "./FromSheet.tsx";

const TIME_LABEL = {
  "30": "student.home.time.30",
  "60": "student.home.time.60",
  "120": "student.home.time.120",
  close: "student.home.time.close",
} as const satisfies Record<TimeChoice, PlainCopyId>;
const TIME_OPTIONS = (["30", "60", "120", "close"] as const).map((value) => ({
  value,
  label: t(TIME_LABEL[value]),
}));

const PRESET_LABEL = {
  silent_solo: "student.preset.silent_solo",
  group: "student.preset.group",
  calls: "student.preset.calls",
  late_night: "student.preset.late_night",
  quick_30: "student.preset.quick_30",
} as const satisfies Record<BuiltinPresetId, PlainCopyId>;

const isBuiltin = (id: string): id is BuiltinPresetId => id in PRESET_LABEL;

/** A preset's chip label: the deck's name for a built-in, the student's own for a custom one. */
export function presetLabel(p: Preset): string {
  return isBuiltin(p.id) ? t(PRESET_LABEL[p.id]) : (p.name ?? p.id);
}

/** Home's question, top to bottom: from where, for how long, what for, how many, and more. */
export function QueryPanel(props: { q: QuickPick }) {
  const { q } = props;
  const [fromOpen, setFromOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const buildings = q.bundle?.buildings ?? [];
  const fromName = buildings.find((b) => b.id === q.from)?.name ?? "";
  const extraCount = q.prefs.extra.length;
  return (
    <section className="query">
      <ul className="row-list">
        <Row
          title={t("student.home.from.label")}
          lead={<Icon icon={MapPin} />}
          end={
            <>
              <span>{fromName}</span>
              <Icon icon={ChevronRight} />
            </>
          }
          onClick={() => setFromOpen(true)}
        />
      </ul>
      {q.fromFallback ? (
        <p className="lede">{t("student.home.from.fallback", { building: fromName })}</p>
      ) : null}
      <Segmented
        label={t("student.home.time.label")}
        icon={Clock}
        options={TIME_OPTIONS}
        value={q.prefs.time}
        onChange={(time) => q.set({ time })}
      />
      <div className="field">
        {/* The chips' fieldset names the group for assistive tech; this is its visible label. */}
        <p className="field__label" aria-hidden="true">
          <Icon icon={BookOpen} size={16} />
          {t("student.home.preset.label")}
        </p>
        <FilterChips
          label={t("student.home.preset.label")}
          options={q.presets.map((p) => ({ value: p.id, label: presetLabel(p) }))}
          value={q.preset.id}
          onChange={(presetId) => q.set({ presetId })}
        />
      </div>
      {q.preset.groupDefault === null ? null : (
        <Stepper
          label={t("student.home.group.label")}
          icon={Users}
          min={2}
          max={12}
          value={q.prefs.group}
          onChange={(group) => {
            if (group !== null) q.set({ group });
          }}
        />
      )}
      <div className="query__more">
        <Button
          variant="quiet"
          icon={<Icon icon={SlidersHorizontal} />}
          onClick={() => setFiltersOpen(true)}
        >
          {extraCount > 0
            ? t("student.home.filters.button_count", { count: extraCount })
            : t("student.home.filters.button")}
        </Button>
      </div>
      <FromSheet
        open={fromOpen}
        buildings={buildings}
        value={q.from}
        onChoose={(from) => q.set({ from })}
        onClose={() => setFromOpen(false)}
      />
      <FiltersSheet
        open={filtersOpen}
        extra={q.prefs.extra}
        onChange={(extra) => q.set({ extra })}
        onClose={() => setFiltersOpen(false)}
      />
    </section>
  );
}
