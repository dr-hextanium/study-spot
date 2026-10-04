import {
  type AcceptInviteRequest,
  AcceptInviteResponse,
  ApiError,
  type ApiErrorCode,
  type CreateInviteRequest,
  CreateInviteResponse,
  type CreateSpotRequest,
  Incomplete,
  PendingPhotoList,
  PHOTO_CONTENT_TYPE,
  type PhotoUploadFields,
  PublishStatus,
  type ReviewRequest,
  type SectionWrite,
  SpotList,
  SurveyorList,
  SurveyorPublic,
  SurveySpot,
  type V0Field,
  type VerifyRequest,
  VersionConflict,
  type WriteRequest,
} from "@study-spot/core";
import { z } from "zod";
import type { Http, HttpBody, HttpMethod } from "../adapters.ts";

export const INVITE_GONE = ["invite_invalid", "invite_expired", "invite_used"] as const;
export type InviteGoneCode = (typeof INVITE_GONE)[number];

/** Every survey call resolves to one of these; nothing throws. */
export type ApiResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "conflict"; current: SurveySpot }
  | {
      kind: "invalid";
      status: number;
      code: ApiErrorCode | null;
      message: string | null;
      missing: V0Field[];
    }
  | { kind: "unauthorized" }
  | { kind: "gone"; code: InviteGoneCode }
  | { kind: "network" }
  | { kind: "server"; status: number; reason: "status" | "bad_response" };

const InviteGone = z.object({ error: z.enum(INVITE_GONE) });

function parseBody(text: string): unknown {
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Maps a status and body to a result, validating the body with `schema` on 2xx. */
export function interpret<T>(status: number, text: string, schema: z.ZodType<T>): ApiResult<T> {
  const body = parseBody(text);
  if (status >= 200 && status < 300) {
    const parsed = schema.safeParse(body);
    return parsed.success
      ? { kind: "ok", value: parsed.data }
      : { kind: "server", status, reason: "bad_response" };
  }
  if (status === 401) return { kind: "unauthorized" };
  if (status === 409) {
    const conflict = VersionConflict.safeParse(body);
    if (conflict.success) return { kind: "conflict", current: conflict.data.current };
  }
  if (status === 410) {
    const gone = InviteGone.safeParse(body);
    return { kind: "gone", code: gone.success ? gone.data.error : "invite_invalid" };
  }
  if (status >= 400 && status < 500) {
    const incomplete = Incomplete.safeParse(body);
    if (incomplete.success) {
      return {
        kind: "invalid",
        status,
        code: "incomplete",
        message: null,
        missing: incomplete.data.missing,
      };
    }
    const err = ApiError.safeParse(body);
    return {
      kind: "invalid",
      status,
      code: err.success ? err.data.error : null,
      message: err.success ? (err.data.message ?? null) : null,
      missing: [],
    };
  }
  return { kind: "server", status, reason: "status" };
}

export type SurveyApiDeps = {
  http: Http;
  /** API origin without a trailing slash, e.g. https://study-spot.onrender.com */
  baseUrl: string;
  /** The stored bearer token, read on every call. */
  token: () => string | null;
};

export type SectionWriteCall = {
  client_write_id: string;
  base_version: number;
  write: SectionWrite;
};

export type SurveyApi = ReturnType<typeof createSurveyApi>;

/** Typed client for every plan A route except the photo image bytes (plan D fetches those). */
export function createSurveyApi(deps: SurveyApiDeps) {
  async function call<T>(
    method: HttpMethod,
    path: string,
    schema: z.ZodType<T>,
    body: HttpBody | null = null,
    auth = true,
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body?.kind === "json") headers["content-type"] = "application/json";
    if (auth) {
      const token = deps.token();
      if (token === null) return { kind: "unauthorized" };
      headers.authorization = `Bearer ${token}`;
    }
    let res: { status: number; text: string };
    try {
      res = await deps.http.send({ method, url: `${deps.baseUrl}${path}`, headers, body });
    } catch {
      return { kind: "network" };
    }
    return interpret(res.status, res.text, schema);
  }
  const json = (value: unknown): HttpBody => ({ kind: "json", json: JSON.stringify(value) });
  const spot = (id: string) => `/survey/spots/${encodeURIComponent(id)}`;
  const photo = (id: string) => `/survey/photos/${encodeURIComponent(id)}`;

  return {
    acceptInvite: (req: AcceptInviteRequest) =>
      call("POST", "/auth/accept", AcceptInviteResponse, json(req), false),
    me: () => call("GET", "/auth/me", SurveyorPublic),
    logout: () => call("POST", "/auth/logout", z.null()),
    listSpots: () => call("GET", "/survey/spots", SpotList),
    getSpot: (id: string) => call("GET", spot(id), SurveySpot),
    createSpot: (req: CreateSpotRequest) => call("POST", "/survey/spots", SurveySpot, json(req)),
    writeSection: (id: string, req: SectionWriteCall) =>
      call(
        "PUT",
        `${spot(id)}/${req.write.section}`,
        SurveySpot,
        json({
          client_write_id: req.client_write_id,
          base_version: req.base_version,
          data: req.write.data,
        }),
      ),
    verify: (id: string, req: VerifyRequest) =>
      call("POST", `${spot(id)}/verify`, SurveySpot, json(req)),
    publish: (id: string, req: WriteRequest) =>
      call("POST", `${spot(id)}/publish`, SurveySpot, json(req)),
    unpublish: (id: string, req: WriteRequest) =>
      call("POST", `${spot(id)}/unpublish`, SurveySpot, json(req)),
    review: (id: string, req: ReviewRequest) =>
      call("POST", `${spot(id)}/review`, SurveySpot, json(req)),
    uploadPhoto: (fields: PhotoUploadFields, bytes: Uint8Array) => {
      const parts: Record<string, string> = {
        spot_id: fields.spot_id,
        client_write_id: fields.client_write_id,
      };
      if (fields.taken_at !== undefined) parts.taken_at = fields.taken_at;
      return call("POST", "/survey/photos", SurveySpot, {
        kind: "multipart",
        fields: parts,
        file: { field: "file", filename: "photo.jpg", contentType: PHOTO_CONTENT_TYPE, bytes },
      });
    },
    setCover: (photoId: string, req: WriteRequest) =>
      call("POST", `${photo(photoId)}/cover`, SurveySpot, json(req)),
    approvePhoto: (photoId: string, req: WriteRequest) =>
      call("POST", `${photo(photoId)}/approve`, SurveySpot, json(req)),
    rejectPhoto: (photoId: string, req: WriteRequest) =>
      call("POST", `${photo(photoId)}/reject`, SurveySpot, json(req)),
    createInvite: (req: CreateInviteRequest) =>
      call("POST", "/admin/invites", CreateInviteResponse, json(req)),
    listSurveyors: () => call("GET", "/admin/surveyors", SurveyorList),
    revokeSurveyor: (id: string) =>
      call("POST", `/admin/surveyors/${encodeURIComponent(id)}/revoke`, SurveyorPublic),
    pendingPhotos: () => call("GET", "/admin/photos/pending", PendingPhotoList),
    publishStatus: () => call("GET", "/admin/publish", PublishStatus),
    publishNow: () => call("POST", "/admin/publish", PublishStatus),
  };
}
