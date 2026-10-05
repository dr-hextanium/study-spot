import { expect, test } from "bun:test";
import { body, setup, WEB_ORIGIN } from "./helpers.ts";

test("GET /health answers ok with a null commit when none is configured", async () => {
  const { app } = await setup();
  const res = await app.inject({ method: "GET", url: "/health" });
  expect(res.statusCode).toBe(200);
  expect(body(res)).toEqual({ ok: true, commit: null });
});

test("GET /health reports the deployed commit", async () => {
  const commit = "0123456789abcdef0123456789abcdef01234567";
  const { app } = await setup({ commit });
  const res = await app.inject({ method: "GET", url: "/health" });
  expect(res.statusCode).toBe(200);
  expect(body(res)).toEqual({ ok: true, commit });
});

test("unknown routes return a not_found code", async () => {
  const { app } = await setup();
  const res = await app.inject({ method: "GET", url: "/nope" });
  expect(res.statusCode).toBe(404);
  expect(body(res)).toEqual({ error: "not_found" });
});

test("CORS allows only the web origin, with Authorization and PUT", async () => {
  const { app } = await setup();
  const preflight = (origin: string) =>
    app.inject({
      method: "OPTIONS",
      url: "/survey/spots/x/identity",
      headers: {
        origin,
        "access-control-request-method": "PUT",
        "access-control-request-headers": "authorization,content-type",
      },
    });
  const ok = await preflight(WEB_ORIGIN);
  expect(ok.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
  expect(String(ok.headers["access-control-allow-methods"])).toContain("PUT");
  expect(String(ok.headers["access-control-allow-headers"])).toContain("authorization");
  expect(ok.headers["access-control-allow-credentials"]).toBeUndefined();

  const evil = await preflight("https://evil.example");
  expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
});
