import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { PingCounter } from "../ping/counter.ts";
import type { RateLimiter } from "../ping/rateLimit.ts";

const PingBody = z.object({ spot_id: z.uuid() });

/**
 * Anonymous pick ping. The body is only a spot id, sent as text/plain so the browser makes
 * no preflight. The address feeds the in-memory rate limiter and nothing else: the route is
 * silent in logs, and a limited or unknown spot still answers 204 so nothing leaks.
 */
export const pingRoutes =
  (deps: { pings: PingCounter; limiter: RateLimiter }): FastifyPluginAsyncZod =>
  async (app) => {
    app.addContentTypeParser("text/plain", { parseAs: "string" }, (_req, body, done) => {
      try {
        done(null, JSON.parse(String(body)));
      } catch {
        done(Object.assign(new Error("body is not JSON"), { statusCode: 400 }), undefined);
      }
    });

    app.post(
      "/ping/pick",
      { logLevel: "silent", schema: { body: PingBody } },
      async (req, reply) => {
        if (deps.limiter.allow(req.ip)) deps.pings.add(req.body.spot_id);
        return reply.code(204).send();
      },
    );
  };
