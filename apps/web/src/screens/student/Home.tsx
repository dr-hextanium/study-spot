import { DEFAULT_ACCESS } from "@perch/core";
import { directionsUrl, pickCardView, readCustomPresets, t } from "@perch/ui-logic";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useState } from "react";
import { useDeps } from "../../app/AppProvider.tsx";
import { type DrawResult, useQuickPick } from "../../hooks/useQuickPick.ts";
import { useToasts } from "../../hooks/useToasts.tsx";
import { isIos } from "../../lib/platform.ts";
import { Banner } from "../../ui/Banner.tsx";
import { IconButton } from "../../ui/Button.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { DataState } from "./DataState.tsx";
import { EmptyPick } from "./EmptyPick.tsx";
import { InstallNote } from "./InstallNote.tsx";
import { AltRows, PickCard } from "./PickCard.tsx";
import { QueryPanel } from "./QueryPanel.tsx";

/** Student Home: the question, then the one place to go. Reads only the cached spots. */
export function Home() {
  const deps = useDeps();
  // Me keeps the custom presets; Home reads them once when it opens.
  const [custom] = useState(() => readCustomPresets(deps.prefs).value);
  const q = useQuickPick(custom);
  const { pickPing } = deps;
  const toasts = useToasts();
  const say = (r: DrawResult) => {
    if (r === "same") toasts.show(t("student.pick.only_one"));
    if (r === "none") toasts.show(t("student.pick.none_left"));
  };
  const bundle = q.bundle;
  const accessIsDefault =
    q.access.residence === DEFAULT_ACCESS.residence &&
    q.access.quad === DEFAULT_ACCESS.quad &&
    q.access.grad === DEFAULT_ACCESS.grad;
  return (
    <Screen title={t("student.home.title")} meta={<DataState state={q.load} />}>
      {bundle === null ? null : (
        <>
          <QueryPanel q={q} />
          {q.pick !== null ? (
            <>
              <PickCard
                view={pickCardView(q.pick.primary, bundle, q.now)}
                heading={
                  q.mode === "surprise"
                    ? t("student.pick.surprise_heading")
                    : t("student.pick.heading")
                }
                directions={directionsUrl(q.pick.primary.spot, isIos(navigator))}
                // The one moment a pick counts: never on render, reroll or surprise.
                onDirections={() => {
                  if (q.pick !== null) pickPing(q.pick.primary.spot.id);
                  q.notePick();
                }}
                onSomethingElse={() => say(q.somethingElse())}
                onSurprise={() => say(q.surprise())}
              />
              <AltRows views={q.pick.alternates.map((c) => pickCardView(c, bundle, q.now))} />
              <InstallNote />
            </>
          ) : q.empty !== null ? (
            <EmptyPick
              help={q.empty}
              bundle={bundle}
              onSurprise={() => say(q.surprise())}
              onApply={(next) => q.set(next)}
            />
          ) : null}
          {!q.prefs.accessNoteDismissed && accessIsDefault ? (
            <Banner
              tone="note"
              action={
                <>
                  <Link to="/me" className="btn btn--ink">
                    <span className="btn__label">{t("student.home.access.action")}</span>
                  </Link>
                  <IconButton
                    label={t("student.home.access.dismiss")}
                    icon={X}
                    onClick={() => q.set({ accessNoteDismissed: true })}
                  />
                </>
              }
            >
              {t("student.home.access.note")}
            </Banner>
          ) : null}
        </>
      )}
    </Screen>
  );
}
