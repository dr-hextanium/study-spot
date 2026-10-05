import {
  CreateSpotRequest,
  IdParams,
  ReviewRequest,
  SectionParams,
  SectionWrite,
  SectionWriteRequest,
  SpotList,
  SurveySpot,
  VerifyRequest,
  WriteRequest,
} from "@study-spot/core";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppDeps } from "../app.ts";
import { requireSurveyor } from "../auth/guards.ts";
import { HttpError } from "../http.ts";
import { currentTerm, listSurveySpots } from "../spots/load.ts";
import {
  createDraft,
  publishSpot,
  reviewSpot,
  spotOr404,
  unpublishSpot,
  verifyGroups,
  writeSection,
} from "../spots/write.ts";
import { spotWriter } from "../writes/spotWrite.ts";

export function spotRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  const spotWrite = spotWriter(deps);

  return async (app) => {
    app.get("/survey/spots", { schema: { response: { 200: SpotList } } }, async (req) => {
      await requireSurveyor(deps, req);
      return listSurveySpots(deps.db, deps.config.campusId, deps.clock.now());
    });

    app.get(
      "/survey/spots/:id",
      { schema: { params: IdParams, response: { 200: SurveySpot } } },
      async (req) => {
        await requireSurveyor(deps, req);
        const term = await currentTerm(deps.db, deps.config.campusId, deps.clock.now());
        return spotOr404(deps.db, req.params.id, deps.config.campusId, term);
      },
    );

    app.post(
      "/survey/spots",
      { schema: { body: CreateSpotRequest, response: { 201: SurveySpot } } },
      async (req, reply) => {
        const me = await requireSurveyor(deps, req);
        const r = await spotWrite(me, req.body.client_write_id, "spot.create", (tx, ctx) =>
          createDraft(tx, ctx, req.body.identity),
        );
        return reply.code(201).send(r.body);
      },
    );

    app.put(
      "/survey/spots/:id/:section",
      {
        schema: { params: SectionParams, body: SectionWriteRequest, response: { 200: SurveySpot } },
      },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        const write = SectionWrite.safeParse({ section: req.params.section, data: req.body.data });
        if (!write.success) {
          throw new HttpError(400, {
            error: "invalid_request",
            message: z.prettifyError(write.error),
          });
        }
        const r = await spotWrite(
          me,
          req.body.client_write_id,
          `spot.section.${req.params.section}`,
          (tx, ctx) => writeSection(tx, ctx, req.params.id, req.body.base_version, write.data),
        );
        return r.body;
      },
    );

    app.post(
      "/survey/spots/:id/verify",
      { schema: { params: IdParams, body: VerifyRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        const r = await spotWrite(me, req.body.client_write_id, "spot.verify", (tx, ctx) =>
          verifyGroups(tx, ctx, req.params.id, req.body.base_version, req.body.groups),
        );
        return r.body;
      },
    );

    app.post(
      "/survey/spots/:id/publish",
      { schema: { params: IdParams, body: WriteRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        const r = await spotWrite(me, req.body.client_write_id, "spot.publish", (tx, ctx) =>
          publishSpot(tx, ctx, req.params.id),
        );
        return r.body;
      },
    );

    app.post(
      "/survey/spots/:id/unpublish",
      { schema: { params: IdParams, body: WriteRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        if (me.role !== "admin") throw new HttpError(403, { error: "forbidden" });
        const r = await spotWrite(me, req.body.client_write_id, "spot.unpublish", (tx, ctx) =>
          unpublishSpot(tx, ctx, req.params.id),
        );
        return r.body;
      },
    );

    app.post(
      "/survey/spots/:id/review",
      { schema: { params: IdParams, body: ReviewRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        const r = await spotWrite(me, req.body.client_write_id, "spot.review", (tx, ctx) =>
          reviewSpot(tx, ctx, req.params.id, req.body.base_version),
        );
        return r.body;
      },
    );
  };
}
