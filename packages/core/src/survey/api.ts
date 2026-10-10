import { z } from "zod";
import { AttributeGroup, SurveyorRole } from "../enums.ts";
import { V0_FIELD } from "./missing.ts";
import { IdentitySection, SurveySection } from "./sections.ts";
import { SurveyorPublic, SurveyPhoto, SurveySpot } from "./spot.ts";

export const ClientWriteId = z.uuid();
export const BaseVersion = z.number().int().positive();

/** Largest accepted photo upload in bytes, after on-device resize. */
export const PHOTO_MAX_BYTES = 1_500_000;
export const PHOTO_CONTENT_TYPE = "image/jpeg";

/** Route params for routes ending in :id (spots, photos, surveyors). */
export const IdParams = z.object({ id: z.uuid() });

// Auth

/** 32 random bytes, base64url without padding. */
export const OpaqueToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const AcceptInviteRequest = z.object({
  token: OpaqueToken,
  display_name: z.string().trim().min(1).max(60).optional(),
});
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequest>;

export const AcceptInviteResponse = z.object({ token: OpaqueToken, surveyor: SurveyorPublic });
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponse>;

export const CreateInviteRequest = z.object({
  role: SurveyorRole,
  /** Set for a re-login link for an existing surveyor; omitted for a new surveyor. */
  surveyor_id: z.uuid().optional(),
});
export type CreateInviteRequest = z.infer<typeof CreateInviteRequest>;

export const CreateInviteResponse = z.object({ url: z.string(), expires_at: z.iso.datetime() });
export type CreateInviteResponse = z.infer<typeof CreateInviteResponse>;

export const SurveyorList = z.object({
  surveyors: z.array(SurveyorPublic.extend({ created_at: z.iso.datetime() })),
});
export type SurveyorList = z.infer<typeof SurveyorList>;

// Campus

/** The campus and its buildings, for the new-spot building picker and campus-local dates. */
export const CampusInfo = z.object({
  campus: z.object({ id: z.string(), name: z.string(), tz: z.string() }),
  buildings: z.array(
    z.object({ id: z.string(), name: z.string(), lat: z.number(), lng: z.number() }),
  ),
});
export type CampusInfo = z.infer<typeof CampusInfo>;

// Spots

export const SectionParams = z.object({ id: z.uuid(), section: SurveySection });

export const CreateSpotRequest = z.object({
  client_write_id: ClientWriteId,
  identity: IdentitySection,
});
export type CreateSpotRequest = z.infer<typeof CreateSpotRequest>;

/** `data` is checked against the section schema by SectionWrite once the section is known. */
export const SectionWriteRequest = z.object({
  client_write_id: ClientWriteId,
  base_version: BaseVersion,
  data: z.unknown(),
});
export type SectionWriteRequest = z.infer<typeof SectionWriteRequest>;

export const VerifyRequest = z.object({
  client_write_id: ClientWriteId,
  base_version: BaseVersion,
  groups: z
    .array(AttributeGroup)
    .min(1)
    .refine((g) => new Set(g).size === g.length, "each group once"),
});
export type VerifyRequest = z.infer<typeof VerifyRequest>;

export const ReviewRequest = z.object({
  client_write_id: ClientWriteId,
  base_version: BaseVersion,
});
export type ReviewRequest = z.infer<typeof ReviewRequest>;

/** Publish, unpublish, and photo cover, approve, reject. */
export const WriteRequest = z.object({ client_write_id: ClientWriteId });
export type WriteRequest = z.infer<typeof WriteRequest>;

// Photos

/** Text fields of the multipart photo upload; the `file` part is checked separately. */
export const PhotoUploadFields = z.object({
  spot_id: z.uuid(),
  client_write_id: ClientWriteId,
  /** Capture time from the phone. Clamped to the server clock when in the future. */
  taken_at: z.iso.datetime().optional(),
});
export type PhotoUploadFields = z.infer<typeof PhotoUploadFields>;

export const PendingPhotoList = z.object({
  photos: z.array(
    SurveyPhoto.extend({ spot_name: z.string(), uploaded_by_name: z.string().nullable() }),
  ),
});
export type PendingPhotoList = z.infer<typeof PendingPhotoList>;

// Publishing

export const PublishStatus = z.object({
  dirty: z.boolean(),
  running: z.boolean(),
  last_published_at: z.iso.datetime().nullable(),
  last_hash: z.string().nullable(),
  last_attempt_at: z.iso.datetime().nullable(),
  warnings: z.array(z.string()),
  last_error: z.string().nullable(),
  /**
   * Another process (live, or crashed) holds the publish lease until this time, so a
   * publish from here waits. Null when the lease is free or held by this server.
   */
  waiting_until: z.iso.datetime().nullable().default(null),
});
export type PublishStatus = z.infer<typeof PublishStatus>;

// Errors

export const API_ERROR = [
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "invite_invalid",
  "invite_expired",
  "invite_used",
  "display_name_required",
  "version_conflict",
  "incomplete",
  "slug_taken",
  "unknown_building",
  "unknown_term",
  "write_id_reused",
  "photo_too_large",
  "photo_type",
  "internal",
] as const;
export const ApiErrorCode = z.enum(API_ERROR);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiError = z.object({ error: ApiErrorCode, message: z.string().optional() });
export type ApiError = z.infer<typeof ApiError>;

/** 409 body: the client shows `current` in the conflict view. */
export const VersionConflict = z.object({
  error: z.literal("version_conflict"),
  current: SurveySpot,
});
export type VersionConflict = z.infer<typeof VersionConflict>;

/** 422 body from publish. */
export const Incomplete = z.object({
  error: z.literal("incomplete"),
  missing: z.array(z.enum(V0_FIELD)).min(1),
});
export type Incomplete = z.infer<typeof Incomplete>;
