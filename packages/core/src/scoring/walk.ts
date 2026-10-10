import type { Bundle, BundleSpot } from "../bundle.ts";
import { fallbackWalkMinutes } from "../geo.ts";

export const STAFFED_DESK_MINUTES = 2;

/** Extra minutes for stairs or elevators: 1 per floor away from ground. */
export function floorPenalty(floor: string): number {
  const f = floor.trim().toLowerCase();
  // "B2" is two floors down; a bare "B" or "B0" is one.
  const below = /^b(\d+)/.exec(f);
  if (below?.[1] !== undefined) return Math.max(1, Number.parseInt(below[1], 10));
  if (/^(b\b|basement|ll\b|lower)/.test(f)) return 1;
  if (/^(g\b|ground|main|lobby)/.test(f)) return 0;
  const n = Number.parseInt(f, 10);
  if (Number.isNaN(n)) return 0;
  if (n >= 1) return n - 1;
  return Math.abs(n);
}

/** Minutes from a building to a spot: matrix (or straight-line fallback), floors, desk. */
export function walkMinutes(bundle: Bundle, from: string, spot: BundleSpot): number {
  const ids = bundle.walk.building_ids;
  const i = ids.indexOf(from);
  const j = ids.indexOf(spot.building_id);
  let base = i >= 0 && j >= 0 ? bundle.walk.minutes[i]?.[j] : undefined;
  if (base === undefined) {
    const a = bundle.buildings.find((x) => x.id === from);
    base = a === undefined ? 0 : fallbackWalkMinutes(a, spot);
  }
  const desk = spot.entry_method === "staffed_desk" ? STAFFED_DESK_MINUTES : 0;
  return base + floorPenalty(spot.floor) + desk;
}
