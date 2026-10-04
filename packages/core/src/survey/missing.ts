import type { AttributeGroup, Eligibility, FoodPolicy, NoisePolicy } from "../enums.ts";

/** Fields a published spot must have, in the order they are reported. */
export const V0_FIELD = [
  "directions",
  "eligibility",
  "seat_count",
  "outlet_coverage_pct",
  "noise_policy",
  "group_work_ok",
  "food_policy",
  "last_verified",
] as const;
export type V0Field = (typeof V0_FIELD)[number];

/** The section that fills each field, so a "Missing: x" row can link to its editor. */
export const V0_FIELD_SECTION: Readonly<Record<V0Field, AttributeGroup | null>> = {
  directions: "identity",
  eligibility: "access",
  seat_count: "seating",
  outlet_coverage_pct: "power",
  noise_policy: "environment",
  group_work_ok: "use_fit",
  food_policy: "use_fit",
  // Any saved or checked section adds a verification date.
  last_verified: null,
};

/** The structural slice of a spot that completeness depends on. DB rows and API spots both fit. */
export type V0Input = {
  directions: string | null;
  eligibility: Eligibility | null;
  seat_count: number | null;
  outlet_coverage_pct: number | null;
  noise_policy: NoisePolicy | null;
  group_work_ok: boolean | null;
  food_policy: FoodPolicy | null;
  /** True when at least one attribute group has a verification date. */
  has_verification: boolean;
};

/**
 * v0-required fields a spot still lacks. Used by the server publish check, the
 * client publish button, and bundle assembly, so all three agree. Hours are not
 * required: a spot with no hours this term publishes with hours_unconfirmed.
 */
export function missingV0Fields(spot: V0Input): V0Field[] {
  const missing: V0Field[] = [];
  if (spot.directions === null) missing.push("directions");
  if (spot.eligibility === null) missing.push("eligibility");
  if (spot.seat_count === null) missing.push("seat_count");
  if (spot.outlet_coverage_pct === null) missing.push("outlet_coverage_pct");
  if (spot.noise_policy === null) missing.push("noise_policy");
  if (spot.group_work_ok === null) missing.push("group_work_ok");
  if (spot.food_policy === null) missing.push("food_policy");
  if (!spot.has_verification) missing.push("last_verified");
  return missing;
}
