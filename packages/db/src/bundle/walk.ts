import { fallbackWalkMinutes } from "@study-spot/core";
import type { building, walk_matrix } from "../schema/index.ts";

export type BuildingRow = typeof building.$inferSelect;
export type WalkRow = typeof walk_matrix.$inferSelect;

export type AssembledWalk = {
  building_ids: string[];
  minutes: number[][];
  estimated_pairs: [number, number][];
};

export function assembleWalk(buildings: BuildingRow[], pairs: WalkRow[]): AssembledWalk {
  const sorted = [...buildings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const known = new Map(pairs.map((p) => [`${p.from_building_id}|${p.to_building_id}`, p.minutes]));
  const estimated_pairs: [number, number][] = [];

  const minutes = sorted.map((from, i) =>
    sorted.map((to, j) => {
      if (i === j) return 0;
      const m = known.get(`${from.id}|${to.id}`);
      if (m !== undefined) return m;
      estimated_pairs.push([i, j]);
      return fallbackWalkMinutes(from, to);
    }),
  );

  return { building_ids: sorted.map((b) => b.id), minutes, estimated_pairs };
}
