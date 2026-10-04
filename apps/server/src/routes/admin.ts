import {
  CreateInviteRequest,
  CreateInviteResponse,
  IdParams,
  SurveyorPublic,
} from "@study-spot/core";
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
