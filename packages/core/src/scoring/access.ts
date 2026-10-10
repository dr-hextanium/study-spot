import { z } from "zod";
import type { BundleBuilding, BundleSpot } from "../bundle.ts";
import type { Eligibility } from "../enums.ts";

/** Self-declared, unverified, stored on the phone only. Ids are bundle building ids. */
export const AccessProfile = z.object({
  residence: z.string().min(1).nullable(),
  quad: z.string().min(1).nullable(),
  grad: z.boolean(),
});
export type AccessProfile = z.infer<typeof AccessProfile>;
export const DEFAULT_ACCESS: AccessProfile = { residence: null, quad: null, grad: false };

export type Access =
  | { kind: "open" }
  | { kind: "locked"; eligibility: Eligibility; scope: string | null }
  | { kind: "unverified" };

export function scopeKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function matchesScope(
  scope: string | null,
  buildingId: string | null,
  buildings: readonly BundleBuilding[],
): boolean {
  if (scope === null || buildingId === null) return false;
  const key = scopeKey(scope);
  const b = buildings.find((x) => x.id === buildingId);
  return key === buildingId || (b !== undefined && key === scopeKey(b.name));
}

/** Locked beats unverified, so Browse can name who a spot is for. */
export function accessFor(
  spot: BundleSpot,
  profile: AccessProfile,
  buildings: readonly BundleBuilding[],
): Access {
  let eligible: boolean;
  switch (spot.eligibility) {
    case "all_students":
    case "public":
      eligible = true;
      break;
    case "grad_only":
      eligible = profile.grad;
      break;
    case "residents_building":
      eligible = matchesScope(spot.eligibility_scope, profile.residence, buildings);
      break;
    case "residents_quad":
      eligible = matchesScope(spot.eligibility_scope, profile.quad, buildings);
      break;
    case "department":
      eligible = false;
      break;
  }
  if (!eligible)
    return { kind: "locked", eligibility: spot.eligibility, scope: spot.eligibility_scope };
  if (!spot.eligibility_verified) return { kind: "unverified" };
  return { kind: "open" };
}
