import type { Db } from "@perch/db";
import type { FastifyRequest } from "fastify";
import type { Clock } from "../clock.ts";
import { HttpError } from "../http.ts";
import { type AuthedSurveyor, authenticate } from "./sessions.ts";

export type AuthDeps = { db: Db; clock: Clock };

/** The active surveyor making the request, or a 401. */
export async function requireSurveyor(
  deps: AuthDeps,
  req: FastifyRequest,
): Promise<AuthedSurveyor> {
  const who = await authenticate(deps.db, req.headers.authorization, deps.clock.now());
  if (!who) throw new HttpError(401, { error: "unauthorized" });
  return who;
}

/** An active admin, a 401 without a valid session, or a 403 for a plain surveyor. */
export async function requireAdmin(deps: AuthDeps, req: FastifyRequest): Promise<AuthedSurveyor> {
  const who = await requireSurveyor(deps, req);
  if (who.role !== "admin") throw new HttpError(403, { error: "forbidden" });
  return who;
}
