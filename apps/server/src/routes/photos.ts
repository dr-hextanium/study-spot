import multipart from "@fastify/multipart";
import {
  IdParams,
  PHOTO_CONTENT_TYPE,
  PHOTO_MAX_BYTES,
  PhotoUploadFields,
  SurveySpot,
  WriteRequest,
} from "@perch/core";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppDeps } from "../app.ts";
import { requireSurveyor } from "../auth/guards.ts";
import { HttpError } from "../http.ts";
import { isJpeg, sha256Hex } from "../photos/store.ts";
import { addPhoto, approvePhoto, photoOr404, rejectPhoto, setCover } from "../photos/write.ts";
import { currentTerm, loadSurveySpot } from "../spots/load.ts";
import { spotWriter } from "../writes/spotWrite.ts";

function tooLarge(err: unknown): boolean {
  return typeof err === "object" && err !== null && "statusCode" in err && err.statusCode === 413;
}

export function photoRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  const spotWrite = spotWriter(deps);

  return async (app) => {
    await app.register(multipart, {
      limits: { fileSize: PHOTO_MAX_BYTES, files: 1, fields: 5, parts: 6 },
    });

    app.post(
      "/survey/photos",
      { schema: { response: { 201: SurveySpot } } },
      async (req, reply) => {
        const me = await requireSurveyor(deps, req);
        if (!req.isMultipart()) {
          throw new HttpError(400, { error: "invalid_request", message: "expected multipart" });
        }

        // Field order is up to the client, so read every part before validating.
        const fields: Record<string, string> = {};
        let file: Uint8Array | null = null;
        try {
          for await (const part of req.parts()) {
            if (part.type === "file") {
              if (part.fieldname !== "file") {
                throw new HttpError(400, { error: "invalid_request", message: "unexpected file" });
              }
              file = await part.toBuffer();
            } else if (typeof part.value === "string") {
              fields[part.fieldname] = part.value;
            }
          }
        } catch (err) {
          if (tooLarge(err))
            throw new HttpError(413, {
              error: "photo_too_large",
              message: "Photos must be 1.5 MB or smaller.",
            });
          throw err;
        }

        const parsed = PhotoUploadFields.safeParse(fields);
        if (!parsed.success) {
          throw new HttpError(400, {
            error: "invalid_request",
            message: z.prettifyError(parsed.error),
          });
        }
        if (file === null) {
          throw new HttpError(400, { error: "invalid_request", message: "file is required" });
        }
        if (!isJpeg(file))
          throw new HttpError(415, { error: "photo_type", message: "Photos must be JPEG." });

        // Check the spot before storing bytes, so a bad id leaves no orphan blob.
        const now = deps.clock.now();
        const term = await currentTerm(deps.db, deps.config.campusId, now);
        if (!(await loadSurveySpot(deps.db, parsed.data.spot_id, deps.config.campusId, term))) {
          throw new HttpError(404, { error: "not_found" });
        }

        const sha256 = sha256Hex(file);
        await deps.photos.put({ sha256, bytes: file, contentType: PHOTO_CONTENT_TYPE });
        const claimed = parsed.data.taken_at === undefined ? now : new Date(parsed.data.taken_at);
        // A phone clock running ahead must not date a photo in the future.
        const takenAt = claimed.getTime() > now.getTime() ? now : claimed;
        const r = await spotWrite(me, parsed.data.client_write_id, "photo.upload", (tx, ctx) =>
          addPhoto(tx, ctx, { spotId: parsed.data.spot_id, sha256, takenAt }),
        );
        return reply.code(201).send(r.body);
      },
    );

    app.get("/survey/photos/:id/image", { schema: { params: IdParams } }, async (req, reply) => {
      await requireSurveyor(deps, req);
      const photo = await photoOr404(deps.db, req.params.id, deps.config.campusId);
      const bytes = photo.blob_sha256 === null ? null : await deps.photos.get(photo.blob_sha256);
      if (bytes === null) throw new HttpError(404, { error: "not_found" });
      return reply
        .type(PHOTO_CONTENT_TYPE)
        .header("cache-control", "private, max-age=86400")
        .send(Buffer.from(bytes));
    });

    app.post(
      "/survey/photos/:id/cover",
      { schema: { params: IdParams, body: WriteRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        const r = await spotWrite(me, req.body.client_write_id, "photo.cover", (tx, ctx) =>
          setCover(tx, ctx, req.params.id),
        );
        return r.body;
      },
    );

    app.post(
      "/survey/photos/:id/approve",
      { schema: { params: IdParams, body: WriteRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        const r = await spotWrite(me, req.body.client_write_id, "photo.approve", (tx, ctx) =>
          approvePhoto(tx, ctx, req.params.id),
        );
        return r.body;
      },
    );

    app.post(
      "/survey/photos/:id/reject",
      { schema: { params: IdParams, body: WriteRequest, response: { 200: SurveySpot } } },
      async (req) => {
        const me = await requireSurveyor(deps, req);
        if (me.role !== "admin") throw new HttpError(403, { error: "forbidden" });
        const r = await spotWrite(me, req.body.client_write_id, "photo.reject", (tx, ctx) =>
          rejectPhoto(tx, ctx, req.params.id),
        );
        return r.body;
      },
    );
  };
}
