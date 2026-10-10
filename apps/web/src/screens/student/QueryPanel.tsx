import type { BuiltinPresetId, Preset, TimeChoice } from "@perch/core";
import { type PlainCopyId, t } from "@perch/ui-logic";
import {
  BookOpen,
  ChevronRight,
  Clock,
  type LucideIcon,
  MapPin,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import type { QuickPick } from "../../hooks/useQuickPick.ts";
import { FilterChips } from "../../ui/FilterChips.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Row } from "../../ui/Row.tsx";
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

/**
 * One line of the question: the label on the left, its control on the right. The control's
 * own legend names it for assistive tech, so this visible label is hidden from them.
 */
function Line(props: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="query__line">
      <span className="query__label" aria-hidden="true">
        <Icon icon={props.icon} />
        {props.label}
      </span>
      <div className="query__control">{props.children}</div>
    </div>
  );
}

/**
 * Home's question, one compact line each: from where, for how long, what for, how many
 * (group presets only), and more filters. Short enough that the pick shows on a phone
 * without scrolling.
 */
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
      <Line icon={Clock} label={t("student.home.time.label")}>
        <FilterChips
          label={t("student.home.time.label")}
          options={TIME_OPTIONS}
          value={q.prefs.time}
          onChange={(time) => q.set({ time })}
        />
      </Line>
      <Line icon={BookOpen} label={t("student.home.preset.label")}>
        <FilterChips
          label={t("student.home.preset.label")}
          options={q.presets.map((p) => ({ value: p.id, label: presetLabel(p) }))}
          value={q.preset.id}
          onChange={(presetId) => q.set({ presetId })}
        />
      </Line>
      {q.preset.groupDefault === null ? null : (
        <Line icon={Users} label={t("student.home.group.label")}>
          <Stepper
            label={t("student.home.group.label")}
            hideLabel
            min={2}
            max={12}
            value={q.prefs.group}
            onChange={(group) => {
              if (group !== null) q.set({ group });
            }}
          />
        </Line>
      )}
      <ul className="row-list">
        <Row
          title={
            extraCount > 0
              ? t("student.home.filters.button_count", { count: extraCount })
              : t("student.home.filters.button")
          }
          lead={<Icon icon={SlidersHorizontal} />}
          end={<Icon icon={ChevronRight} />}
          onClick={() => setFiltersOpen(true)}
        />
      </ul>
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
