import cors from "@fastify/cors";
import type { Db } from "@perch/db";
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
import { createPingCounter, type PingCounter } from "./ping/counter.ts";
import { flushPicks } from "./ping/flush.ts";
import { dbKnownSpots, type KnownSpots } from "./ping/knownSpots.ts";
import { createRateLimiter } from "./ping/rateLimit.ts";
import { type Publisher, realTimers } from "./publish/publisher.ts";
import { adminRoutes } from "./routes/admin.ts";
import { authRoutes } from "./routes/auth.ts";
import { campusRoutes } from "./routes/campus.ts";
import { healthRoutes } from "./routes/health.ts";
import { photoRoutes } from "./routes/photos.ts";
import { pingRoutes } from "./routes/ping.ts";
import { publishRoutes } from "./routes/publish.ts";
import { spotRoutes } from "./routes/spots.ts";

export type AppConfig = {
  /** The PWA origin, the only origin CORS allows. */
  webOrigin: string;
  campusId: string;
  /** The deployed git commit (RENDER_GIT_COMMIT), shown on /health; null when unknown. */
  commit: string | null;
  /** Trusted proxy hops for the client address (TRUST_PROXY_HOPS). Defaults to 1. */
  trustProxyHops?: number;
};

export type AppDeps = {
  db: Db;
  clock: Clock;
  config: AppConfig;
  publisher: Publisher;
  photos: PhotoStore;
  /** In-memory pick counter; built from the database when omitted. */
  pings?: PingCounter;
  /** Published spot ids the ping accepts; built from the database when omitted. */
  knownSpots?: KnownSpots;
  logger?: boolean | { stream: { write(message: string): void } };
};

/** Status carried by Fastify and plugin errors (400 bad JSON, 413 too large, 415 type), else 500. */
function statusOf(err: unknown): number {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const code = err.statusCode;
    if (typeof code === "number" && code >= 400 && code < 600) return code;
  }
  return 500;
}

/**
 * Requests are logged as method and url only: no remote address, no port, no headers, so a
 * log line can never tie a request to a phone.
 */
function loggerOptions(logger: AppDeps["logger"]) {
  if (!logger) return false;
  const serializers = {
    req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
  };
  return logger === true ? { serializers } : { serializers, stream: logger.stream };
}

export async function buildApp(deps: AppDeps) {
  const hops = deps.config.trustProxyHops ?? 1;
  const app = Fastify({
    logger: loggerOptions(deps.logger),
    // Trust the proxy hops in front of us (Render: 1) and take the address the last trusted
    // one appended, so a client-sent x-forwarded-for entry cannot spoof it. Fastify 5 fails
    // closed on a bare number, so the rule is a function. 0 trusts nothing (no proxy).
    trustProxy: hops === 0 ? false : (_addr, hop) => hop < hops,
  }).withTypeProvider<ZodTypeProvider>();
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

  await app.register(healthRoutes(deps.config));
  await app.register(authRoutes(deps));
  await app.register(adminRoutes(deps));
  await app.register(campusRoutes(deps));
  await app.register(spotRoutes(deps));
  await app.register(photoRoutes(deps));
  await app.register(publishRoutes(deps));

  const pings =
    deps.pings ??
    createPingCounter({
      clock: deps.clock,
      timers: realTimers,
      flush: (rows) => flushPicks(deps.db, deps.config.campusId, rows),
      log: (message) => app.log.warn(message),
    });
  const limiter = createRateLimiter({
    clock: deps.clock,
    limit: 30,
    windowMs: 3_600_000,
    maxKeys: 5000,
  });
  const known = deps.knownSpots ?? dbKnownSpots(deps.db, deps.config.campusId, deps.clock);
  await app.register(pingRoutes({ pings, limiter, known }));
  app.addHook("onClose", () => pings.close());
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
