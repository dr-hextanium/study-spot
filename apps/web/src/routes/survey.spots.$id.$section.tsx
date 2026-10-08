import { SURVEY_SECTION } from "@study-spot/core";
import { SpotRef, t } from "@study-spot/ui-logic";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { useOutboxSnapshot } from "../hooks/useOutbox.ts";
import { type SpotViewState, useSpotView } from "../hooks/useSpotView.ts";
import { EDITORS } from "../screens/editors/index.tsx";
import { SurveyHeader } from "../screens/SurveyHeader.tsx";
import { LegacyScreen } from "../ui/Screen.tsx";

type Ready = Extract<SpotViewState, { kind: "ready" }>;

const Section = z.enum([...SURVEY_SECTION, "photos"]);

export const Route = createFileRoute("/survey/spots/$id/$section")({
  params: {
    parse: (raw) => {
      const id = SpotRef.safeParse(raw.id);
      const section = Section.safeParse(raw.section);
      if (!id.success || !section.success) throw notFound();
      return { id: id.data, section: section.data };
    },
    stringify: (p) => ({ id: p.id, section: p.section }),
  },
  component: SectionRoute,
});

function SectionRoute() {
  const { id, section } = Route.useParams();
  const state = useSpotView(id);
  const snapshot = useOutboxSnapshot();
  // The editor keeps its form only while the same draft moves from its local id to the real
  // one; any other change of spot starts a fresh form, so one spot's edits never save to another.
  const keyId = useRef(id);
  if (keyId.current !== id && snapshot.idMap[keyId.current] !== id) keyId.current = id;
  const navigate = useNavigate();
  // The last ready screen and where it is moving to, so an editor with unsaved edits
  // stays mounted while a draft made offline moves from its local id to the real one.
  const held = useRef<{ ready: Ready; to: string | null } | null>(null);
  if (state.kind === "ready") held.current = { ready: state, to: null };
  else if (state.kind === "redirect" && held.current !== null) held.current.to = state.to;
  const shown =
    state.kind === "ready"
      ? state
      : (state.kind === "redirect" || state.kind === "loading") &&
          held.current !== null &&
          (state.kind === "redirect" || held.current.to === id)
        ? held.current.ready
        : null;
  useEffect(() => {
    if (state.kind === "redirect") {
      void navigate({
        to: "/survey/spots/$id/$section",
        params: { id: state.to, section },
        replace: true,
      });
    }
  }, [state, section, navigate]);
  if (shown === null) {
    return (
      <>
        <SurveyHeader title={t("app.name")} back={{ to: "/survey" }} />
        <LegacyScreen>
          <p className="lede">
            {state.kind === "missing" ? t("spot.not_found") : t("common.loading")}
          </p>
        </LegacyScreen>
      </>
    );
  }
  const Editor = EDITORS[section];
  // A fresh form each time an editor opens, but not when a draft's id moves.
  return <Editor key={`${section}:${keyId.current}`} view={shown.view} />;
}
