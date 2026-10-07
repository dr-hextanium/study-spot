import { DAY_TYPE, TIME_BLOCK } from "@study-spot/core";
import { COPY, type PlainCopyId, type SpotView, t } from "@study-spot/ui-logic";
import { useState } from "react";
import { cellKey, cellsOf, type Grid, nextBucket, toGrid } from "../../lib/estimates.ts";
import { BUCKET_COPY } from "../../lib/fields.ts";
import { EditorShell } from "./EditorShell.tsx";

const DAY_COPY: Record<(typeof DAY_TYPE)[number], PlainCopyId> = {
  weekday: "estimates.weekday",
  weekend: "estimates.weekend",
};
const BLOCK_COPY: Record<(typeof TIME_BLOCK)[number], PlainCopyId> = {
  morning: "estimates.morning",
  afternoon: "estimates.afternoon",
  evening: "estimates.evening",
  night: "estimates.night",
};

/**
 * Busyness guesses: time blocks down, weekdays and weekends across, so a
 * 360 px phone fits "Nearly full". Each tap moves a cell one bucket up.
 */
export function EstimatesEditor({ view }: { view: SpotView }) {
  const [grid, setGrid] = useState<Grid>(() => toGrid(view.spot.estimates));
  const untouched = view.spot.estimates.length === 0;
  return (
    <EditorShell section="estimates" view={view}>
      {({ set }) => (
        <>
          <p className="lede">{t("estimates.helper")}</p>
          {untouched ? <p className="field__helper">{t("estimates.tap_hint")}</p> : null}
          <table className="grid">
            <thead>
              <tr>
                <td />
                {DAY_TYPE.map((day) => (
                  <th key={day} scope="col" className="label">
                    {t(DAY_COPY[day])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_BLOCK.map((block) => (
                <tr key={block}>
                  <th scope="row" className="label">
                    {t(BLOCK_COPY[block])}
                  </th>
                  {DAY_TYPE.map((day) => {
                    const bucket = grid[cellKey(day, block)];
                    const label =
                      bucket === null ? t("estimates.bucket.unset") : COPY[BUCKET_COPY[bucket]];
                    return (
                      <td key={day}>
                        <button
                          type="button"
                          className={`cell${bucket === null ? " cell--unset" : ""}`}
                          data-bucket={bucket ?? "unset"}
                          aria-label={t("estimates.cell", {
                            day: t(DAY_COPY[day]),
                            block: t(BLOCK_COPY[block]),
                            bucket: label,
                          })}
                          onClick={() => {
                            const next = { ...grid, [cellKey(day, block)]: nextBucket(bucket) };
                            setGrid(next);
                            set("cells", cellsOf(next));
                          }}
                        >
                          <span className="cell__text">{label}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </EditorShell>
  );
}
