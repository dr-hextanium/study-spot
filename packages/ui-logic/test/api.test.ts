import { expect, test } from "bun:test";
import { surveySpotFixture } from "../../core/test/fixtures/survey-spot.ts";
import { createSessionStore, createSurveyApi, SESSION_KEY } from "../src/index.ts";
import { MemoryStorage, ScriptedHttp } from "./fakes.ts";

const BASE = "https://api.example";
const TOKEN = "a".repeat(43);
const WID = "0b7e7f8e-3f3a-4c55-8d5e-1e2f3a4b5c6d";
const spot = surveySpotFixture();
const reply = (status: number, body?: unknown) => ({
  status,
  text: body === undefined ? "" : JSON.stringify(body),
});

function setup(token: string | null = TOKEN) {
  const http = new ScriptedHttp();
  return { http, api: createSurveyApi({ http, baseUrl: BASE, token: () => token }) };
}

test("a section write sends the bearer token, the section path, and only the data", async () => {
  const { http, api } = setup();
  http.replies.push(reply(200, spot));
  const data = { outlet_coverage_pct: 0.4, usb_outlets: null, wifi_mbps: null, cell_signal: null };
  const r = await api.writeSection(spot.id, {
    client_write_id: WID,
    base_version: 3,
    write: { section: "power", data },
  });
  expect(r).toEqual({ kind: "ok", value: spot });
  const sent = http.requests[0];
  expect(sent?.method).toBe("PUT");
  expect(sent?.url).toBe(`${BASE}/survey/spots/${spot.id}/power`);
  expect(sent?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  expect(sent?.body).toEqual({
    kind: "json",
    json: JSON.stringify({ client_write_id: WID, base_version: 3, data }),
  });
});

test("201 is ok and the body is validated", async () => {
  const { http, api } = setup();
  http.replies.push(reply(201, spot), reply(200, { ...spot, version: 0 }));
  expect((await api.getSpot(spot.id)).kind).toBe("ok");
  expect(await api.getSpot(spot.id)).toEqual({
    kind: "server",
    status: 200,
    reason: "bad_response",
  });
});

test("409 carries the current spot", async () => {
  const { http, api } = setup();
  const current = { ...spot, version: 4 };
  http.replies.push(reply(409, { error: "version_conflict", current }));
  expect(await api.review(spot.id, { client_write_id: WID, base_version: 3 })).toEqual({
    kind: "conflict",
    current,
  });
});

test("4xx answers map to invalid with the code, message, and missing list", async () => {
  const cases = [
    [422, { error: "incomplete", missing: ["directions"] }, "incomplete", null, ["directions"]],
    [422, { error: "write_id_reused", message: "used" }, "write_id_reused", "used", []],
    [413, { error: "photo_too_large" }, "photo_too_large", null, []],
    [400, "not an error body", null, null, []],
  ] as const;
  for (const [status, body, code, message, missing] of cases) {
    const { http, api } = setup();
    http.replies.push(reply(status, body));
    expect(await api.publish(spot.id, { client_write_id: WID })).toEqual({
      kind: "invalid",
      status,
      code,
      message,
      missing: [...missing],
    });
  }
});

test("invites: no token is sent and 410 names the reason", async () => {
  const { http, api } = setup(null);
  http.replies.push(reply(410, { error: "invite_used" }), reply(410, {}));
  expect(await api.acceptInvite({ token: TOKEN })).toEqual({ kind: "gone", code: "invite_used" });
  expect(http.requests[0]?.headers.authorization).toBeUndefined();
  expect(await api.acceptInvite({ token: TOKEN })).toEqual({
    kind: "gone",
    code: "invite_invalid",
  });
});

test("no stored token is unauthorized without a request; 401 is unauthorized", async () => {
  const signedOut = setup(null);
  expect(await signedOut.api.listSpots()).toEqual({ kind: "unauthorized" });
  expect(signedOut.http.requests).toEqual([]);
  const { http, api } = setup();
  http.replies.push(reply(401, { error: "unauthorized" }));
  expect(await api.listSpots()).toEqual({ kind: "unauthorized" });
});

test("network failures and 5xx are told apart", async () => {
  const { http, api } = setup();
  http.replies.push("offline", reply(503));
  expect(await api.me()).toEqual({ kind: "network" });
  expect(await api.me()).toEqual({ kind: "server", status: 503, reason: "status" });
});

test("408 and 429 are transient, like a 5xx, so the write is retried", async () => {
  const { http, api } = setup();
  http.replies.push(reply(408), reply(429, { error: "rate_limited" }));
  expect(await api.me()).toEqual({ kind: "server", status: 408, reason: "status" });
  expect(await api.me()).toEqual({ kind: "server", status: 429, reason: "status" });
});

test("photo upload is multipart with the file and text fields", async () => {
  const { http, api } = setup();
  http.replies.push(reply(201, spot));
  const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
  await api.uploadPhoto({ spot_id: spot.id, client_write_id: WID }, bytes);
  const sent = http.requests[0];
  expect(sent?.headers["content-type"]).toBeUndefined();
  expect(sent?.body).toEqual({
    kind: "multipart",
    fields: { spot_id: spot.id, client_write_id: WID },
    file: { field: "file", filename: "photo.jpg", contentType: "image/jpeg", bytes },
  });
});

test("the session store round-trips and rejects corrupt or old data", () => {
  const storage = new MemoryStorage();
  const sessions = createSessionStore(storage);
  const surveyor = { id: spot.id, display_name: "Ana", role: "surveyor", active: true } as const;
  expect(sessions.load()).toBeNull();
  sessions.save({ token: TOKEN, surveyor });
  expect(sessions.token()).toBe(TOKEN);
  storage.setItem(SESSION_KEY, "{not json");
  expect(sessions.load()).toBeNull();
  storage.setItem(SESSION_KEY, JSON.stringify({ token: "short", surveyor }));
  expect(sessions.token()).toBeNull();
  sessions.save({ token: TOKEN, surveyor });
  sessions.clear();
  expect(storage.getItem(SESSION_KEY)).toBeNull();
});

test("logout accepts a 204 with an empty body", async () => {
  const { http, api } = setup();
  http.replies.push(reply(204));
  expect(await api.logout()).toEqual({ kind: "ok", value: null });
  expect(http.requests[0]?.method).toBe("POST");
  expect(http.requests[0]?.url).toBe(`${BASE}/auth/logout`);
  expect(http.requests[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
});

test("photo upload returns the parsed spot, sends auth, and sends taken_at only when given", async () => {
  const { http, api } = setup();
  http.replies.push(reply(201, spot), reply(201, spot));
  const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
  const taken_at = "2026-10-04T12:00:00.000Z";
  const withTaken = await api.uploadPhoto(
    { spot_id: spot.id, client_write_id: WID, taken_at },
    bytes,
  );
  expect(withTaken).toEqual({ kind: "ok", value: spot });
  const first = http.requests[0];
  expect(first?.method).toBe("POST");
  expect(first?.url).toBe(`${BASE}/survey/photos`);
  expect(first?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  expect(first?.body).toEqual({
    kind: "multipart",
    fields: { spot_id: spot.id, client_write_id: WID, taken_at },
    file: { field: "file", filename: "photo.jpg", contentType: "image/jpeg", bytes },
  });
  const without = await api.uploadPhoto({ spot_id: spot.id, client_write_id: WID }, bytes);
  expect(without).toEqual({ kind: "ok", value: spot });
  const body = http.requests[1]?.body;
  expect(body?.kind === "multipart" ? Object.keys(body.fields).sort() : null).toEqual([
    "client_write_id",
    "spot_id",
  ]);
});
