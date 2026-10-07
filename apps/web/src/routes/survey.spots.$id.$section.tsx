import { SURVEY_SECTION } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { type SpotViewState, useSpotView } from "../hooks/useSpotView.ts";
import { EDITORS } from "../screens/editors/index.tsx";
import { SurveyHeader } from "../screens/SurveyHeader.tsx";
import { Screen } from "../ui/Screen.tsx";

type Ready = Extract<SpotViewState, { kind: "ready" }>;

const Section = z.enum([...SURVEY_SECTION, "photos"]);

export const Route = createFileRoute("/survey/spots/$id/$section")({
  params: {
    parse: (raw) => {
      const section = Section.safeParse(raw.section);
      if (!section.success) throw notFound();
      return { id: raw.id, section: section.data };
    },
    stringify: (p) => ({ id: p.id, section: p.section }),
  },
  component: SectionRoute,
});

function SectionRoute() {
  const { id, section } = Route.useParams();
  const state = useSpotView(id);
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
        <Screen>
          <p className="lede">
            {state.kind === "missing" ? t("spot.not_found") : t("common.loading")}
          </p>
        </Screen>
      </>
    );
  }
  const Editor = EDITORS[section];
  // Keyed by section only: a fresh form each time an editor opens, but not when the id moves.
  return <Editor key={section} view={shown.view} />;
}
