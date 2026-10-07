import type { HoursRow } from "@study-spot/core";
import { type PlainCopyId, type SpotView, t } from "@study-spot/ui-logic";
import { useState } from "react";
import {
  closesNextDay,
  copyMonday,
  type DayHours,
  type DayModel,
  DEFAULT_OPEN,
  dayProblem,
  fromWeek,
  timeInputValue,
  toWeek,
} from "../../lib/hours.ts";
import { Button } from "../../ui/Button.tsx";
import { Check } from "../../ui/Check.tsx";
import { GroupHeading } from "../../ui/Screen.tsx";
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

function DayRow(props: {
  model: DayModel;
  showErrors: boolean;
  onChange: (hours: DayHours) => void;
}) {
  const { hours } = props.model;
  const name = t(DAY_NAME[props.model.day]);
  const problem = props.showErrors ? dayProblem(hours) : null;
  const open = hours.kind === "open" ? hours : null;
  return (
    <fieldset className={`field day${problem === null ? "" : " field--error"}`}>
      <legend className="label field__label">{name}</legend>
      {open === null ? null : (
        <div className="day__times">
          <label className="day__time">
            <span className="label">{t("hours.opens")}</span>
            <input
              className="input"
              type="time"
              value={timeInputValue(open.opens)}
              onChange={(e) => props.onChange({ ...open, opens: e.currentTarget.value })}
            />
          </label>
          <label className="day__time">
            <span className="label">{t("hours.closes")}</span>
            <input
              className="input"
              type="time"
              value={timeInputValue(open.closes)}
              onChange={(e) => props.onChange({ ...open, closes: e.currentTarget.value })}
            />
          </label>
          {closesNextDay(hours) ? <span className="day__next">{t("hours.next_day")}</span> : null}
        </div>
      )}
      <div className="day__toggles">
        <Check
          label={t("hours.closed")}
          checked={hours.kind === "closed"}
          onChange={(on) => props.onChange(on ? { kind: "closed" } : DEFAULT_OPEN)}
        />
        <Check
          label={t("hours.all_day")}
          checked={hours.kind === "all_day"}
          onChange={(on) => props.onChange(on ? { kind: "all_day" } : DEFAULT_OPEN)}
        />
      </div>
      {problem === "same_time" ? (
        <p className="field__error">{t("hours.invalid.same_time")}</p>
      ) : null}
      {problem === "missing_time" ? <p className="field__error">{t("common.required")}</p> : null}
    </fieldset>
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
            {term === null ? null : <p className="title">{t("hours.term", { term: term.name })}</p>}
            <p className="lede">{t("hours.helper")}</p>
            <Button onClick={() => commit(copyMonday(regular), exam, withExam)}>
              {t("hours.copy_weekdays")}
            </Button>
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
