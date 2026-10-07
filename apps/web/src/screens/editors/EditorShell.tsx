import type { SurveySection, V0Field } from "@study-spot/core";
import { fieldList, isLocalId, type SpotView, t } from "@study-spot/ui-logic";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useRef, useState } from "react";
import { type SectionFormApi, useSectionForm } from "../../hooks/useSectionForm.ts";
import { useToasts } from "../../hooks/useToasts.tsx";
import { sectionName } from "../../lib/format.ts";
import { Banner } from "../../ui/Banner.tsx";
import { Button } from "../../ui/Button.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { ConfirmSheet } from "../../ui/Sheet.tsx";
import { SurveyHeader } from "../SurveyHeader.tsx";

type Place = { routeId: string; params: Record<string, unknown> };

/** A draft's id changing under the same screen (local to real) is not leaving the editor. */
function isIdMove(current: Place, next: Place): boolean {
  const from = current.params.id;
  return (
    current.routeId === next.routeId &&
    current.params.section === next.params.section &&
    typeof from === "string" &&
    isLocalId(from) &&
    next.params.id !== from
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

type Props<S extends SurveySection> = {
  section: S;
  view: SpotView;
  /** Why "Checked, nothing changed" cannot be used yet, if it cannot. */
  verifyBlocked?: string | undefined;
  /** Checks the schema cannot express (hours that open and close at once). False blocks Save. */
  validate?: () => boolean;
  children: (form: SectionFormApi<S>) => ReactNode;
};

/**
 * One section on one screen (journey B5): the fields, then Save pinned at the
 * bottom with "Checked, nothing changed" beside it. Leaving with edits asks
 * first; saving a change that would take a published spot off the student app
 * asks first too.
 */
export function EditorShell<S extends SurveySection>({
  section,
  view,
  verifyBlocked,
  validate,
  children,
}: Props<S>) {
  const api = useSectionForm(section, view);
  const toasts = useToasts();
  const navigate = useNavigate();
  const [invalid, setInvalid] = useState(false);
  const [cleared, setCleared] = useState<V0Field[] | null>(null);
  // A ref, not state: the blocker is asked during the navigation that saving starts.
  const leaving = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      api.form.dirty && !leaving.current && !isIdMove(current, next),
    withResolver: true,
  });
  const back = () => navigate({ to: "/survey/spots/$id", params: { id: view.spot.id } });

  async function save(force: boolean) {
    setCleared(null);
    if (validate !== undefined && !validate()) return setInvalid(true);
    const outcome = await api.save({ force });
    if (outcome.kind === "invalid") return setInvalid(true);
    if (outcome.kind === "confirm") return setCleared(outcome.fields);
    toasts.track(outcome.clientWriteId, { done: "editor.saved", waiting: "editor.saved_offline" });
    leaving.current = true;
    await back();
  }
  async function verify() {
    if (api.verify === null) return;
    const id = await api.verify();
    toasts.track(id, { done: "editor.verify.done", waiting: "editor.saved_offline" });
    leaving.current = true;
    await back();
  }

  return (
    <>
      <SurveyHeader
        title={sectionName(section)}
        back={{ to: "/survey/spots/$id", params: { id: view.spot.id } }}
      />
      <Screen
        action={
          <>
            <Button variant="primary" wide onClick={() => void save(false)}>
              {t("editor.save")}
            </Button>
            {api.verify === null ? null : verifyBlocked === undefined ? (
              <Button wide disabled={api.form.dirty} onClick={() => void verify()}>
                {t("editor.verify")}
              </Button>
            ) : (
              <p className="pinned__note">{verifyBlocked}</p>
            )}
          </>
        }
      >
        <p className="lede spot-name">{view.spot.official_name}</p>
        {invalid ? <Banner>{t("editor.invalid")}</Banner> : null}
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
