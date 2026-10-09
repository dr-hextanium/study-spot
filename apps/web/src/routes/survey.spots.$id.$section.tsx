import { SURVEY_SECTION, type SurveySection } from "@study-spot/core";
import { SpotRef, t } from "@study-spot/ui-logic";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useOutboxSnapshot } from "../hooks/useOutbox.ts";
import { type SpotViewState, useSpotView } from "../hooks/useSpotView.ts";
import { EDITORS } from "../screens/editors/index.tsx";
import { WalkContext } from "../screens/editors/walk.ts";
import { SurveyHeader } from "../screens/SurveyHeader.tsx";
import { LegacyScreen } from "../ui/Screen.tsx";

type Ready = Extract<SpotViewState, { kind: "ready" }>;

const Section = z.enum([...SURVEY_SECTION, "photos"]);

/**
 * `?walk=1` marks a guided walk over the sections needed to publish (started from
 * the overview's Actions sheet). Anything else is ignored, never an error.
 */
const Search = z.object({ walk: z.literal(1).optional().catch(undefined) });

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
  validateSearch: Search,
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
  const { walk } = Route.useSearch();
  // Sections checked in this walk. They live here, above the editors, so each editor's own
  // remount (a fresh form per section) does not forget them; leaving the route ends the walk.
  // The list belongs to one spot (keyId, so a draft's local-to-real id move keeps it); another
  // spot starts a fresh walk.
  const [owned, setOwned] = useState<{ key: string; list: readonly SurveySection[] }>({
    key: keyId.current,
    list: [],
  });
  const key = keyId.current;
  const checked = owned.key === key ? owned.list : [];
  useEffect(() => {
    if (walk === undefined) setOwned({ key, list: [] });
  }, [walk, key]);
  const walking = useMemo(
    () =>
      walk === 1
        ? {
            checked,
            mark: (s: SurveySection) =>
              setOwned((o) => {
                const list = o.key === key ? o.list : [];
                return { key, list: list.includes(s) ? list : [...list, s] };
              }),
          }
        : null,
    [walk, checked, key],
  );
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
        search: (prev) => prev,
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
  return (
    <WalkContext.Provider value={walking}>
      <Editor key={`${section}:${keyId.current}`} view={shown.view} />
    </WalkContext.Provider>
  );
}
