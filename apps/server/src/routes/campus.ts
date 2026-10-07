import { CampusInfo } from "@study-spot/core";
import { building, campus } from "@study-spot/db";
import { asc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AppDeps } from "../app.ts";
import { requireSurveyor } from "../auth/guards.ts";
import { HttpError } from "../http.ts";

export function campusRoutes(deps: AppDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get("/survey/campus", { schema: { response: { 200: CampusInfo } } }, async (req) => {
      await requireSurveyor(deps, req);
      const [row] = await deps.db.select().from(campus).where(eq(campus.id, deps.config.campusId));
      if (!row) throw new HttpError(404, { error: "not_found" });
      const buildings = await deps.db
        .select({ id: building.id, name: building.name, lat: building.lat, lng: building.lng })
        .from(building)
        .where(eq(building.campus_id, row.id))
        .orderBy(asc(building.name), asc(building.id));
      return { campus: { id: row.id, name: row.name, tz: row.tz }, buildings };
    });
  };
}
