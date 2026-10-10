import {
  DAY_TYPE,
  type DayType,
  type EstimateCell,
  FULLNESS,
  type Fullness,
  type SurveyEstimate,
  TIME_BLOCK,
  type TimeBlock,
} from "@perch/core";

export type CellKey = `${DayType}|${TimeBlock}`;
export type Grid = Readonly<Record<CellKey, Fullness | null>>;

export const cellKey = (day: DayType, block: TimeBlock): CellKey => `${day}|${block}`;

export function emptyGrid(): Record<CellKey, Fullness | null> {
  return {
    "weekday|morning": null,
    "weekday|afternoon": null,
    "weekday|evening": null,
    "weekday|night": null,
    "weekend|morning": null,
    "weekend|afternoon": null,
    "weekend|evening": null,
    "weekend|night": null,
  };
}

export function toGrid(estimates: readonly SurveyEstimate[]): Grid {
  const grid = emptyGrid();
  for (const e of estimates) grid[cellKey(e.day_type, e.block)] = e.bucket;
  return grid;
}

/** Each tap moves one bucket up and wraps from full to empty; an unset cell starts at empty. */
export function nextBucket(current: Fullness | null): Fullness {
  if (current === null) return "empty";
  const i = FULLNESS.indexOf(current);
  return FULLNESS[(i + 1) % FULLNESS.length] ?? "empty";
}

/** Only cells the surveyor has set; the server keeps the latest estimate per cell. */
export function cellsOf(grid: Grid): EstimateCell[] {
  return DAY_TYPE.flatMap((day_type) =>
    TIME_BLOCK.flatMap((block) => {
      const bucket = grid[cellKey(day_type, block)];
      return bucket === null ? [] : [{ day_type, block, bucket }];
    }),
  );
}
