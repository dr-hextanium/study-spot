import { type SpotSummary, V0_FIELD, type V0Field } from "@study-spot/core";
import { COPY, type PlainCopyId, t } from "../copy/index.ts";
import type { WriteError } from "./writes.ts";

const FIELD_COPY = {
  directions: "field.directions",
  eligibility: "field.eligibility",
  seat_count: "field.seat_count",
  outlet_coverage_pct: "field.outlet_coverage_pct",
  noise_policy: "field.noise_policy",
  group_work_ok: "field.group_work_ok",
  food_policy: "field.food_policy",
  last_verified: "field.last_verified",
} as const satisfies Record<V0Field, PlainCopyId>;

/** The surveyor-facing name of a v0-required field. */
export function fieldLabel(field: V0Field): string {
  return COPY[FIELD_COPY[field]];
}

/** Field names as one list, in the order the server reports them. */
export function fieldList(fields: readonly V0Field[]): string {
  return fields.map(fieldLabel).join(", ");
}

/** What the failed-write view says, and whether sending the same write again can work. */
export type FailureView = { message: string; canRetry: boolean };

const CODE_COPY = {
  photo_missing: { id: "failed.reason.photo_missing", canRetry: false },
  photo_unreadable: { id: "failed.reason.photo_unreadable", canRetry: true },
  bad_response: { id: "failed.reason.bad_response", canRetry: false },
  no_base_version: { id: "failed.reason.no_base_version", canRetry: false },
  forbidden: { id: "failed.reason.forbidden", canRetry: true },
  not_found: { id: "failed.reason.not_found", canRetry: false },
  invalid_request: { id: "failed.reason.invalid_request", canRetry: true },
  slug_taken: { id: "failed.reason.slug_taken", canRetry: true },
  unknown_building: { id: "failed.reason.unknown_building", canRetry: true },
  unknown_term: { id: "failed.reason.unknown_term", canRetry: true },
  photo_too_large: { id: "failed.reason.photo_too_large", canRetry: false },
  photo_type: { id: "failed.reason.photo_type", canRetry: false },
  write_id_reused: { id: "failed.reason.write_id_reused", canRetry: false },
} as const;
type KnownCode = keyof typeof CODE_COPY;

function known(code: string | null): code is KnownCode {
  return code !== null && code in CODE_COPY;
}

/**
 * Maps a failed write's error to copy. Server messages are never shown: they
 * can be Zod output a surveyor can't act on. A publish refused as incomplete
 * lists the missing fields by name.
 */
export function failureView(error: WriteError | null): FailureView {
  if (error === null) return { message: t("error.generic"), canRetry: true };
  if (error.missing.length > 0) {
    return {
      message: t("failed.body.publish", { fields: fieldList(error.missing) }),
      canRetry: true,
    };
  }
  if (known(error.code)) {
    const { id, canRetry } = CODE_COPY[error.code];
    return { message: t(id), canRetry };
  }
  if (error.status === 403) return { message: t("failed.reason.forbidden"), canRetry: true };
  if (error.status === 404) return { message: t("failed.reason.not_found"), canRetry: false };
  if (error.status === 413) return { message: t("failed.reason.photo_too_large"), canRetry: false };
  if (error.status === 400 || error.status === 422) {
    return { message: t("failed.reason.invalid_request"), canRetry: true };
  }
  return { message: t("error.generic"), canRetry: true };
}

const MISSING = /^skipped (\S+): missing (.+)$/;
const HOURS = /^skipped (\S+) hours /;
const INVALID = /^skipped (\S+): invalid /;

/**
 * Rewords a publisher warning (buildBundle's `skipped <slug>: ...`) with the
 * spot's name and field names. Unknown shapes pass through unchanged.
 */
export function publishWarningText(warning: string, spots: readonly SpotSummary[]): string {
  const name = (slug: string) => spots.find((s) => s.slug === slug)?.official_name ?? slug;
  const missing = MISSING.exec(warning);
  if (missing?.[1] !== undefined && missing[2] !== undefined) {
    const fields = missing[2]
      .split(", ")
      .filter((f): f is V0Field => (V0_FIELD as readonly string[]).includes(f));
    const reason =
      fields.length > 0
        ? t("admin.publish.warning.missing", { fields: fieldList(fields) })
        : t("admin.publish.warning.invalid");
    return t("admin.publish.warning.item", { name: name(missing[1]), reason });
  }
  const hours = HOURS.exec(warning);
  if (hours?.[1] !== undefined) {
    return t("admin.publish.warning.item", {
      name: name(hours[1]),
      reason: t("admin.publish.warning.hours"),
    });
  }
  const invalid = INVALID.exec(warning);
  if (invalid?.[1] !== undefined) {
    return t("admin.publish.warning.item", {
      name: name(invalid[1]),
      reason: t("admin.publish.warning.invalid"),
    });
  }
  return warning;
}
