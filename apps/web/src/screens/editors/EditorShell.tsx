import type { SurveySection, V0Field } from "@study-spot/core";
import {
  fieldList,
  isLocalId,
  nextAfter,
  plural,
  type SpotView,
  sectionStatuses,
  stepProgress,
  t,
  walkNext,
} from "@study-spot/ui-logic";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck } from "lucide-react";
import { type ReactNode, useContext, useRef, useState } from "react";
import { useDeps } from "../../app/AppProvider.tsx";
import { useCampusTz } from "../../hooks/useQueries.ts";
import { type SectionFormApi, useSectionForm } from "../../hooks/useSectionForm.ts";
import { useToasts } from "../../hooks/useToasts.tsx";
import { sectionName, shortDate } from "../../lib/format.ts";
import { Banner } from "../../ui/Banner.tsx";
import { Button } from "../../ui/Button.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Meta, Screen } from "../../ui/Screen.tsx";
import { ConfirmSheet } from "../../ui/Sheet.tsx";
import { StepBar } from "../../ui/StepBar.tsx";
import { SyncStatus } from "../SyncStatus.tsx";
import { WalkContext } from "./walk.ts";

type Place = { routeId: string; params: Record<string, unknown> };

/** A draft's id changing under the same screen (local to real) is not leaving the editor. */
function isIdMove(current: Place, next: Place, idMap: Readonly<Record<string, string>>): boolean {
  const from = current.params.id;
  return (
    current.routeId === next.routeId &&
    current.params.section === next.params.section &&
    typeof from === "string" &&
    isLocalId(from) &&
    idMap[from] === next.params.id
  );
}

/** Field error text: the deck's specific message where there is one, else "Required". */
export function errorFor(
  errors: Readonly<Record<string, string>>,
  field: string,
  specific?: string,
): string | undefined {
  if (errors[field] === undefined) return undefined;
  return specific ?? t("common.required");
}

/** When this section was last checked, as the line under the step bar; null for sections with no stamp. */
function verifiedLine(
  view: SpotView,
  section: SurveySection,
  opts: { now: Date; tz: string },
): string | null {
  if (section === "estimates") return null;
  const status = sectionStatuses(view, opts).find((x) => x.section === section);
  if (status === undefined) return null;
  if (status.checkedToday) return t("spot.section.verified_today");
  return status.verifiedAt === null
    ? t("home.stale.never")
    : t("spot.section.verified", { date: shortDate(status.verifiedAt, opts.tz) });
}

type Props<S extends SurveySection> = {
  section: S;
  view: SpotView;
  /** Why "Nothing changed" cannot be used yet, if it cannot. */
  verifyBlocked?: string | undefined;
  /** Checks the schema cannot express (hours that open and close at once). False blocks Save. */
  validate?: () => boolean;
  children: (form: SectionFormApi<S>) => ReactNode;
};

/**
 * One section on one screen (journey B5): the fields, then "Save and next" pinned at the
 * bottom with "Nothing changed" under it. Leaving with edits asks first; saving a change that
 * would take a published spot off the student app asks first too. In a guided walk (`?walk=1`)
 * both buttons go on to the next section not yet checked in the walk.
 */
export function EditorShell<S extends SurveySection>({
  section,
  view,
  verifyBlocked,
  validate,
  children,
}: Props<S>) {
  const { outbox } = useDeps();
  const api = useSectionForm(section, view);
  const toasts = useToasts();
  const navigate = useNavigate();
  const walk = useContext(WalkContext);
  const { clock } = useDeps();
  const tz = useCampusTz();
  const progress = stepProgress(view, section);
  // In a walk the next stop counts what was checked in the walk; otherwise what is not done yet.
  const after =
    walk === null ? nextAfter(view, section) : walkNext([...walk.checked, section], section);
  const verifiedAt = verifiedLine(view, section, { now: clock.now(), tz });
  const [invalid, setInvalid] = useState(false);
  const [cleared, setCleared] = useState<V0Field[] | null>(null);
  // A ref, not state: the blocker is asked during the navigation that saving starts.
  const leaving = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      api.form.dirty && !leaving.current && !isIdMove(current, next, outbox.getSnapshot().idMap),
    withResolver: true,
  });
  const back = () => navigate({ to: "/survey/spots/$id", params: { id: view.spot.id } });

  const [failed, setFailed] = useState(false);
  // A storage failure must not strand the surveyor on a button that does nothing: reload what
  // the phone holds, then say so.
  async function guarded(run: () => Promise<void>) {
    setFailed(false);
    try {
      await run();
    } catch {
      leaving.current = false;
      await outbox.reload().catch(() => undefined);
      setFailed(true);
    }
  }
  const save = (force: boolean) => guarded(() => saveNow(force));
  const verify = () => guarded(verifyNow);

  async function saveNow(force: boolean) {
    setCleared(null);
    if (validate !== undefined && !validate()) return setInvalid(true);
    const outcome = await api.save({ force });
    if (outcome.kind === "invalid") return setInvalid(true);
    if (outcome.kind === "confirm") return setCleared(outcome.fields);
    await moveOn(
      outcome.clientWriteId,
      { done: "editor.saved", waiting: "editor.saved_offline" },
      true,
    );
  }
  async function verifyNow() {
    if (api.verify === null) return;
    const id = await api.verify();
    // Outside a walk, a check is done with the section: it returns to the overview.
    await moveOn(
      id,
      { done: "editor.verify.done", waiting: "editor.saved_offline" },
      walk !== null,
    );
  }
  /**
   * After a save or a check: on to the next section in a walk or after Save and next, else the
   * overview. The end of a walk says how many sections were checked; the overview shows what is
   * still only on this phone.
   */
  async function moveOn(
    clientWriteId: string,
    copy: { done: "editor.saved" | "editor.verify.done"; waiting: "editor.saved_offline" },
    onward: boolean,
  ) {
    leaving.current = true;
    const next = onward ? after : null;
    const endOfWalk = walk !== null && next === null;
    if (walk !== null) walk.mark(section);
    if (endOfWalk) {
      const count = new Set([...walk.checked, section]).size;
      toasts.show(plural(count, "editor.walk.done", "editor.walk.done_many"));
    } else {
      toasts.track(clientWriteId, copy);
    }
    if (next === null) return back();
    await navigate({
      to: "/survey/spots/$id/$section",
      params: { id: view.spot.id, section: next },
      ...(walk === null ? {} : { search: { walk: 1 as const } }),
    });
  }

  return (
    <>
      <Screen
        title={sectionName(section)}
        back={{ to: "/survey/spots/$id", params: { id: view.spot.id } }}
        trailing={<SyncStatus variant="icon" />}
        stacked
        meta={
          <div className="editor-meta">
            <p className="editor-name">{view.spot.official_name}</p>
            <StepBar
              steps={progress.steps}
              label={t("progress.label", { done: progress.done, total: progress.total })}
            />
            <p className="progress-line">
              {after === null
                ? t("editor.progress", { done: progress.done, total: progress.total })
                : t("editor.progress.after", {
                    done: progress.done,
                    total: progress.total,
                    section: sectionName(after),
                  })}
            </p>
            {verifiedAt === null ? null : (
              <Meta>
                <span className="meta__item">
                  <Icon icon={CalendarCheck} size={15} />
                  {verifiedAt}
                </span>
              </Meta>
            )}
          </div>
        }
        action={
          <>
            <Button
              variant="primary"
              wide
              trailingIcon={after === null ? undefined : <Icon icon={ArrowRight} />}
              onClick={() => void save(false)}
            >
              {after === null ? t("editor.save") : t("editor.save_next")}
            </Button>
            {api.verify === null ? null : verifyBlocked === undefined ? (
              <Button variant="quiet" wide disabled={api.form.dirty} onClick={() => void verify()}>
                {t("editor.verify")}
              </Button>
            ) : (
              <p className="actionbar__note">{verifyBlocked}</p>
            )}
          </>
        }
      >
        {invalid ? <Banner>{t("editor.invalid")}</Banner> : null}
        {failed ? <Banner>{t("common.save_failed")}</Banner> : null}
        {children(api)}
      </Screen>
      <ConfirmSheet
        open={cleared !== null}
        title={t("editor.unpublish.title")}
        body={t("editor.unpublish.body", { fields: fieldList(cleared ?? []) })}
        action={t("editor.unpublish.action")}
        cancel={t("editor.discard_changes.keep")}
        destructive
        onCancel={() => setCleared(null)}
        onConfirm={() => void save(true)}
      />
      <ConfirmSheet
        open={blocker.status === "blocked"}
        title={t("editor.discard_changes.title")}
        body={t("editor.discard_changes.body", { section: sectionName(section) })}
        action={t("editor.discard_changes.action")}
        cancel={t("editor.discard_changes.keep")}
        destructive
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  );
}
