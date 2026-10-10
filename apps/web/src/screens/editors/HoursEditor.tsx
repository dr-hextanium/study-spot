import type { HoursRow } from "@perch/core";
import { type PlainCopyId, type SpotView, t } from "@perch/ui-logic";
import { ChevronDown, Copy } from "lucide-react";
import { useId, useState } from "react";
import {
  closesNextDay,
  copyMonday,
  type DayHours,
  type DayModel,
  DEFAULT_OPEN,
  dayProblem,
  fromWeek,
  timeInputValue,
  timeLabel,
  toWeek,
} from "../../lib/hours.ts";
import { Button } from "../../ui/Button.tsx";
import { Check } from "../../ui/Check.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { GroupHeading } from "../../ui/Screen.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { EditorShell } from "./EditorShell.tsx";

const DAY_NAME: Record<DayModel["day"], PlainCopyId> = {
  1: "hours.day.mon",
  2: "hours.day.tue",
  3: "hours.day.wed",
  4: "hours.day.thu",
  5: "hours.day.fri",
  6: "hours.day.sat",
  0: "hours.day.sun",
};

type DayMode = "hours" | "closed" | "all_day";

const MODE_OF: Record<DayHours["kind"], DayMode> = {
  open: "hours",
  closed: "closed",
  all_day: "all_day",
};

/** The one line a collapsed day shows: its hours, "Closed", or "Open 24 hours". */
function summaryOf(hours: DayHours): string {
  switch (hours.kind) {
    case "closed":
      return t("hours.closed");
    case "all_day":
      return t("hours.all_day");
    case "open": {
      if (hours.opens === "" || hours.closes === "") return t("hours.summary_unset");
      return t(closesNextDay(hours) ? "hours.summary_next" : "hours.summary", {
        opens: timeLabel(hours.opens),
        closes: timeLabel(hours.closes),
      });
    }
  }
}

function DayRow(props: {
  model: DayModel;
  showErrors: boolean;
  onChange: (hours: DayHours) => void;
}) {
  const { hours } = props.model;
  const name = t(DAY_NAME[props.model.day]);
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const problem = props.showErrors ? dayProblem(hours) : null;
  // A day with a problem stays open so its message and fields are in view.
  const shown = expanded || problem !== null;
  const open = hours.kind === "open" ? hours : null;
  return (
    <div className={`day${problem === null ? "" : " field--error"}`}>
      <button
        type="button"
        className="row day__head"
        aria-label={`${name}, ${summaryOf(hours)}`}
        aria-expanded={shown}
        aria-disabled={problem === null ? undefined : true}
        aria-controls={panelId}
        onClick={() => {
          // Locked open while it has an error, so the message and fields stay in view.
          if (problem === null) setExpanded(!expanded);
        }}
      >
        <span className="row__title day__name">{name}</span>
        <span className="day__summary truncate">{summaryOf(hours)}</span>
        <Icon icon={ChevronDown} className={`day__chev${shown ? " day__chev--open" : ""}`} />
      </button>
      <div className="day__panel" id={panelId} hidden={!shown}>
        <Segmented<DayMode>
          label={name}
          hideLabel
          options={[
            { value: "hours", label: t("hours.mode.hours") },
            { value: "closed", label: t("hours.mode.closed") },
            { value: "all_day", label: t("hours.mode.all_day") },
          ]}
          value={MODE_OF[hours.kind]}
          onChange={(mode) =>
            props.onChange(
              mode === "hours"
                ? DEFAULT_OPEN
                : mode === "closed"
                  ? { kind: "closed" }
                  : { kind: "all_day" },
            )
          }
        />
        {open === null ? null : (
          <div className="day__times">
            <label className="day__time">
              <span className="day__label">{t("hours.opens")}</span>
              <input
                className="input"
                type="time"
                value={timeInputValue(open.opens)}
                onChange={(e) => props.onChange({ ...open, opens: e.currentTarget.value })}
              />
            </label>
            <div className="day__closes">
              <label className="day__time">
                <span className="day__label">{t("hours.closes")}</span>
                <input
                  className="input"
                  type="time"
                  value={timeInputValue(open.closes)}
                  onChange={(e) => props.onChange({ ...open, closes: e.currentTarget.value })}
                />
              </label>
              {closesNextDay(hours) ? (
                <span className="day__next">{t("hours.next_day")}</span>
              ) : null}
            </div>
          </div>
        )}
        {problem === "same_time" ? (
          <p className="field__error">{t("hours.invalid.same_time")}</p>
        ) : null}
        {problem === "missing_time" ? <p className="field__error">{t("common.required")}</p> : null}
      </div>
    </div>
  );
}

function Week(props: {
  week: DayModel[];
  showErrors: boolean;
  onChange: (week: DayModel[]) => void;
}) {
  return (
    <>
      {props.week.map((d) => (
        <DayRow
          key={d.day}
          model={d}
          showErrors={props.showErrors}
          onChange={(hours) =>
            props.onChange(props.week.map((x) => (x.day === d.day ? { ...x, hours } : x)))
          }
        />
      ))}
    </>
  );
}

/**
 * The week for the current term (journey B5): copy Monday to the weekdays,
 * closed or 24 hours per day, closing after midnight reads "next day", and a
 * second week for finals.
 */
export function HoursEditor({ view }: { view: SpotView }) {
  const rows: readonly HoursRow[] = view.spot.hours;
  const [regular, setRegular] = useState(() => toWeek(rows, false));
  const [exam, setExam] = useState(() => toWeek(rows, true));
  const [withExam, setWithExam] = useState(() => rows.some((r) => r.is_exam));
  const [showErrors, setShowErrors] = useState(false);
  const term = view.spot.term;
  const verifyBlocked =
    term === null
      ? t("failed.reason.unknown_term")
      : view.spot.hours.length === 0
        ? t("editor.verify.hours_missing", { term: term.name })
        : undefined;
  const allDays = withExam ? [...regular, ...exam] : regular;
  return (
    <EditorShell
      section="hours"
      view={view}
      verifyBlocked={verifyBlocked}
      validate={() => {
        setShowErrors(true);
        return term !== null && allDays.every((d) => dayProblem(d.hours) === null);
      }}
    >
      {({ set }) => {
        const commit = (nextRegular: DayModel[], nextExam: DayModel[], examOn: boolean) => {
          setRegular(nextRegular);
          setExam(nextExam);
          setWithExam(examOn);
          set("rows", [
            ...fromWeek(nextRegular, false),
            ...(examOn ? fromWeek(nextExam, true) : []),
          ]);
        };
        return (
          <>
            {term === null ? null : (
              <p className="hours-term">{t("hours.term", { term: term.name })}</p>
            )}
            <p className="lede">{t("hours.helper")}</p>
            <div className="inline-action">
              <Button
                variant="quiet"
                icon={<Icon icon={Copy} />}
                onClick={() => commit(copyMonday(regular), exam, withExam)}
              >
                {t("hours.copy_weekdays")}
              </Button>
            </div>
            <Week
              week={regular}
              showErrors={showErrors}
              onChange={(w) => commit(w, exam, withExam)}
            />
            <Check
              label={t("hours.exam.toggle")}
              checked={withExam}
              onChange={(on) => commit(regular, exam, on)}
            />
            {withExam ? (
              <section aria-labelledby="exam-hours">
                <GroupHeading id="exam-hours">{t("hours.exam.title")}</GroupHeading>
                <Week
                  week={exam}
                  showErrors={showErrors}
                  onChange={(w) => commit(regular, w, true)}
                />
              </section>
            ) : null}
          </>
        );
      }}
    </EditorShell>
  );
}
