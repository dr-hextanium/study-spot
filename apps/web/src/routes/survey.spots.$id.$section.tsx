import { SURVEY_SECTION } from "@study-spot/core";
import { t } from "@study-spot/ui-logic";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { useSpotView } from "../hooks/useSpotView.ts";
import { EDITORS } from "../screens/editors/index.tsx";
import { SurveyHeader } from "../screens/SurveyHeader.tsx";
import { Screen } from "../ui/Screen.tsx";

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
  useEffect(() => {
    if (state.kind === "redirect") {
      void navigate({
        to: "/survey/spots/$id/$section",
        params: { id: state.to, section },
        replace: true,
      });
    }
  }, [state, section, navigate]);
  if (state.kind !== "ready") {
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
  // Keyed by spot and section: a fresh form each time an editor opens.
  return <Editor key={`${state.view.spot.id}:${section}`} view={state.view} />;
}
