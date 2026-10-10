import { AcceptInviteRequest, AcceptInviteResponse, SurveyorPublic } from "@perch/core";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AppDeps } from "../app.ts";
import { requireSurveyor } from "../auth/guards.ts";
import { acceptInvite } from "../auth/invites.ts";
import { deleteSession } from "../auth/sessions.ts";

export function authRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      "/auth/accept",
      { schema: { body: AcceptInviteRequest, response: { 200: AcceptInviteResponse } } },
      async (req) =>
        acceptInvite(deps.db, {
          token: req.body.token,
          displayName: req.body.display_name,
          now: deps.clock.now(),
        }),
    );

    app.get("/auth/me", { schema: { response: { 200: SurveyorPublic } } }, async (req) => {
      const { sessionId: _, ...me } = await requireSurveyor(deps, req);
      return me;
    });

    app.post("/auth/logout", async (req, reply) => {
      const me = await requireSurveyor(deps, req);
      await deleteSession(deps.db, me.sessionId);
      return reply.code(204).send();
    });
  };
}
