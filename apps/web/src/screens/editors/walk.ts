import type { SurveySection } from "@study-spot/core";
import { createContext } from "react";

/**
 * A guided walk over the sections needed to publish (`?walk=1`). It lives in the section route,
 * so it survives moving from one editor to the next and ends when the surveyor leaves the route.
 * A section joins `checked` only after the surveyor opened it and saved or checked it.
 */
export type Walk = {
  checked: readonly SurveySection[];
  mark(section: SurveySection): void;
};

/** Null when there is no walk. */
export const WalkContext = createContext<Walk | null>(null);
