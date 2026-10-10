import { type BundleBuilding, haversineMeters } from "@perch/core";
import type { LatLngFix } from "../adapters.ts";

/** Worse than this, the guess would mislead; ask for a building instead. */
export const MAX_FIX_METERS = 1000;

/** Snaps a one-off fix to the nearest building. The caller drops the fix right after. */
export function nearestBuilding(
  buildings: readonly BundleBuilding[],
  fix: LatLngFix,
): BundleBuilding | null {
  if (fix.accuracyMeters > MAX_FIX_METERS) return null;
  let best: BundleBuilding | null = null;
  let bestM = Number.POSITIVE_INFINITY;
  for (const b of buildings) {
    const m = haversineMeters(fix, b);
    if (m < bestM) {
      best = b;
      bestM = m;
    }
  }
  return best;
}
