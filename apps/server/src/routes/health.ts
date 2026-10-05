import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

const HealthBody = z.object({ ok: z.literal(true), commit: z.string().nullable() });

/**
 * Liveness only. Never touches the database, so health checks do not keep Neon awake.
 * Reports the deployed commit so the release smoke can tell a new deploy from the old one.
 */
export const healthRoutes =
  (config: { commit: string | null }): FastifyPluginAsyncZod =>
  async (app) => {
    app.get("/health", { schema: { response: { 200: HealthBody } } }, async () => ({
      ok: true as const,
      commit: config.commit,
    }));
  };
