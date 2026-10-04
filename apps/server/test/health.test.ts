import { expect, test } from "bun:test";
import { createTestDb } from "@study-spot/db/testing";
import { buildApp } from "../src/app.ts";

const WEB = "https://study-spot.pages.dev";

async function app() {
  return buildApp({
    db: await createTestDb(),
    clock: { now: () => new Date("2026-10-13T18:00:00Z") },
    config: { webOrigin: WEB, campusId: "sbu" },
  });
}

function body(res: { body: string }): unknown {
  return JSON.parse(res.body);
}

test("GET /health answers ok", async () => {
  const res = await (await app()).inject({ method: "GET", url: "/health" });
  expect(res.statusCode).toBe(200);
  expect(body(res)).toEqual({ ok: true });
});

test("unknown routes return a not_found code", async () => {
  const res = await (await app()).inject({ method: "GET", url: "/nope" });
  expect(res.statusCode).toBe(404);
  expect(body(res)).toEqual({ error: "not_found" });
});

test("CORS allows only the web origin, with Authorization and PUT", async () => {
  const a = await app();
  const preflight = (origin: string) =>
    a.inject({
      method: "OPTIONS",
      url: "/survey/spots/x/identity",
      headers: {
        origin,
        "access-control-request-method": "PUT",
        "access-control-request-headers": "authorization,content-type",
      },
    });
  const ok = await preflight(WEB);
  expect(ok.headers["access-control-allow-origin"]).toBe(WEB);
  expect(String(ok.headers["access-control-allow-methods"])).toContain("PUT");
  expect(String(ok.headers["access-control-allow-headers"])).toContain("authorization");
  expect(ok.headers["access-control-allow-credentials"]).toBeUndefined();

  const evil = await preflight("https://evil.example");
  expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
});
