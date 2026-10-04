import { SurveySpot } from "@study-spot/core";
import type { AppDeps } from "../app.ts";
import type { AuthedSurveyor } from "../auth/sessions.ts";
import { currentTerm } from "../spots/load.ts";
import type { SpotWriteContext } from "../spots/write.ts";
import { type Tx, type WriteOutcome, type WriteResult, withWrite } from "./withWrite.ts";

export type SpotWriter = (
  me: AuthedSurveyor,
  clientWriteId: string,
  kind: string,
  fn: (tx: Tx, ctx: SpotWriteContext) => Promise<WriteOutcome<SurveySpot>>,
) => Promise<WriteResult<SurveySpot>>;

/** withWrite for writes that answer with the full spot, with the term and clock resolved once. */
export function spotWriter(deps: AppDeps): SpotWriter {
  const writeDeps = { db: deps.db, campusId: deps.config.campusId, publisher: deps.publisher };
  return (me, clientWriteId, kind, fn) => {
    const now = deps.clock.now();
    return withWrite(
      writeDeps,
      { surveyorId: me.id, clientWriteId, kind, schema: SurveySpot },
      async (tx) => {
        const term = await currentTerm(tx, deps.config.campusId, now);
        return fn(tx, {
          surveyorId: me.id,
          role: me.role,
          now,
          campusId: deps.config.campusId,
          term,
        });
      },
    );
  };
}
