import { type BundleBuilding, haversineMeters } from "@perch/core";
import type { LatLngFix } from "../adapters.ts";

/** Worse than this, the guess would mislead; ask for a building instead. */
export const MAX_FIX_METERS = 1000;
/** Farther than this from every building, the student is off campus: keep the From they had. */
export const MAX_BUILDING_METERS = 2000;

export type Nearest =
  | { kind: "near"; building: BundleBuilding }
  | { kind: "rough" }
  | { kind: "far" };

/** Snaps a one-off fix to the nearest building. The caller drops the fix right after. */
export function nearestBuilding(buildings: readonly BundleBuilding[], fix: LatLngFix): Nearest {
  if (fix.accuracyMeters > MAX_FIX_METERS) return { kind: "rough" };
  let best: BundleBuilding | null = null;
  let bestM = Number.POSITIVE_INFINITY;
  for (const b of buildings) {
    const m = haversineMeters(fix, b);
    if (m < bestM) {
      best = b;
      bestM = m;
    }
  }
  return best === null || bestM > MAX_BUILDING_METERS
    ? { kind: "far" }
    : { kind: "near", building: best };
}
