import {
  CreateInviteRequest,
  CreateInviteResponse,
  IdParams,
  PendingPhotoList,
  SurveyorList,
  SurveyorPublic,
} from "@perch/core";
import { building, spot, spot_photo, surveyor } from "@perch/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AppDeps } from "../app.ts";
import { requireAdmin } from "../auth/guards.ts";
import { createInvite, revokeSurveyor } from "../auth/invites.ts";
import { HttpError } from "../http.ts";

export function adminRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/admin/invites",
      { schema: { body: CreateInviteRequest, response: { 200: CreateInviteResponse } } },
      async (req) => {
        const admin = await requireAdmin(deps, req);
        const created = await createInvite(deps.db, {
          role: req.body.role,
          surveyorId: req.body.surveyor_id ?? null,
          createdBy: admin.id,
          now: deps.clock.now(),
          webOrigin: deps.config.webOrigin,
        });
        return { url: created.url, expires_at: created.expires_at.toISOString() };
      },
    );

    app.get("/admin/surveyors", { schema: { response: { 200: SurveyorList } } }, async (req) => {
      await requireAdmin(deps, req);
      const rows = await deps.db
        .select()
        .from(surveyor)
        .orderBy(asc(surveyor.display_name), asc(surveyor.id));
      return {
        surveyors: rows.map((r) => ({
          id: r.id,
          display_name: r.display_name,
          role: r.role,
          active: r.active,
          created_at: r.created_at.toISOString(),
        })),
      };
    });

    app.get(
      "/admin/photos/pending",
      { schema: { response: { 200: PendingPhotoList } } },
      async (req) => {
        await requireAdmin(deps, req);
        const rows = await deps.db
          .select({
            photo: spot_photo,
            spot_name: spot.official_name,
            uploaded_by_name: surveyor.display_name,
          })
          .from(spot_photo)
          .innerJoin(spot, eq(spot.id, spot_photo.spot_id))
          .innerJoin(building, eq(building.id, spot.building_id))
          .leftJoin(surveyor, eq(surveyor.id, spot_photo.uploaded_by))
          .where(and(isNull(spot_photo.approved_at), eq(building.campus_id, deps.config.campusId)))
          .orderBy(asc(spot_photo.taken_at), asc(spot_photo.id));
        return {
          photos: rows.map(({ photo: p, spot_name, uploaded_by_name }) => ({
            id: p.id,
            spot_id: p.spot_id,
            url: p.url,
            taken_at: p.taken_at.toISOString(),
            is_cover: p.is_cover,
            uploaded_by: p.uploaded_by,
            approved: false,
            approved_at: null,
            spot_name,
            uploaded_by_name,
          })),
        };
      },
    );

    app.post(
      "/admin/surveyors/:id/revoke",
      { schema: { params: IdParams, response: { 200: SurveyorPublic } } },
      async (req) => {
        const admin = await requireAdmin(deps, req);
        if (admin.id === req.params.id) {
          throw new HttpError(403, { error: "forbidden", message: "cannot revoke yourself" });
        }
        return revokeSurveyor(deps.db, req.params.id);
      },
    );
  };
}
