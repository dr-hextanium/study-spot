import { PublishStatus } from "@study-spot/core";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AppDeps } from "../app.ts";
import { requireAdmin } from "../auth/guards.ts";

export function publishRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get("/admin/publish", { schema: { response: { 200: PublishStatus } } }, async (req) => {
      await requireAdmin(deps, req);
      return deps.publisher.status();
    });

    /** Publishes now and answers with the resulting status; a failure shows in last_error. */
    app.post("/admin/publish", { schema: { response: { 200: PublishStatus } } }, async (req) => {
      await requireAdmin(deps, req);
      await deps.publisher.runNow();
      return deps.publisher.status();
    });
  };
}
