import type { LatLngFix } from "@study-spot/ui-logic";

/** Worse than this, the building's own point is the better guess (journey edge 10). */
export const GOOD_FIX_METERS = 50;

export type LocationState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "denied" }
  | { kind: "fix"; fix: LatLngFix };

/** The spot's point: a good fix, else the building's. */
export function spotPoint(
  location: LocationState,
  building: { lat: number; lng: number },
): { lat: number; lng: number } {
  if (location.kind === "fix" && location.fix.accuracyMeters <= GOOD_FIX_METERS) {
    return { lat: location.fix.lat, lng: location.fix.lng };
  }
  return { lat: building.lat, lng: building.lng };
}
