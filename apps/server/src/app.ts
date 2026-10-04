import cors from "@fastify/cors";
import type { Db } from "@study-spot/db";
import Fastify from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Clock } from "./clock.ts";
import { HttpError } from "./http.ts";
import type { PhotoStore } from "./photos/store.ts";
import { adminRoutes } from "./routes/admin.ts";
import { authRoutes } from "./routes/auth.ts";
import { healthRoutes } from "./routes/health.ts";
import { photoRoutes } from "./routes/photos.ts";
import { spotRoutes } from "./routes/spots.ts";
import type { PublishQueue } from "./writes/withWrite.ts";

export type AppConfig = {
  /** The PWA origin, the only origin CORS allows. */
  webOrigin: string;
  campusId: string;
};

export type AppDeps = {
  db: Db;
  clock: Clock;
  config: AppConfig;
  publisher: PublishQueue;
  photos: PhotoStore;
  logger?: boolean;
};

/** Status carried by Fastify and plugin errors (400 bad JSON, 413 too large, 415 type), else 500. */
function statusOf(err: unknown): number {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const code = err.statusCode;
    if (typeof code === "number" && code >= 400 && code < 600) return code;
  }
  return 500;
}

export async function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: deps.logger ?? false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send(err.body);
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({ error: "invalid_request", message: err.message });
    }
    const status = statusOf(err);
    if (status >= 500) {
      req.log.error(err);
      return reply.code(500).send({ error: "internal" });
    }
    const message = err instanceof Error ? err.message : "bad request";
    return reply.code(status).send({ error: "invalid_request", message });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "not_found" }));

  await app.register(cors, {
    origin: [deps.config.webOrigin],
    methods: ["GET", "POST", "PUT"],
    allowedHeaders: ["authorization", "content-type"],
    maxAge: 600,
  });

  await app.register(healthRoutes);
  await app.register(authRoutes(deps));
  await app.register(adminRoutes(deps));
  await app.register(spotRoutes(deps));
  await app.register(photoRoutes(deps));
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
