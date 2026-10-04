import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

/** Liveness only. Never touches the database, so health checks do not keep Neon awake. */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health",
    { schema: { response: { 200: z.object({ ok: z.literal(true) }) } } },
    async () => ({ ok: true as const }),
  );
};
