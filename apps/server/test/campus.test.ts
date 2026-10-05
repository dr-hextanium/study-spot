import { expect, test } from "bun:test";
import { CampusInfo, CreateInviteResponse } from "@study-spot/core";
import { body, setup, signIn, WEB_ORIGIN } from "./helpers.ts";

test("a signed-in surveyor reads the campus and its buildings by name", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const res = await ctx.app.inject({ method: "GET", url: "/survey/campus", headers: me.headers });
  expect(res.statusCode).toBe(200);
  const info = CampusInfo.parse(body(res));
  expect(info.campus).toEqual({
    id: "sbu",
    name: "Stony Brook University",
    tz: "America/New_York",
  });
  const names = info.buildings.map((b) => b.name);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  expect(info.buildings.find((b) => b.id === "melville-library")).toEqual({
    id: "melville-library",
    name: "Melville Library",
    lat: 40.9154,
    lng: -73.1222,
  });
});

test("the campus route needs a session", async () => {
  const ctx = await setup();
  const res = await ctx.app.inject({ method: "GET", url: "/survey/campus" });
  expect(res.statusCode).toBe(401);
});

test("a re-login link carries the relogin hint and a new-surveyor link does not", async () => {
  const ctx = await setup();
  const admin = await signIn(ctx, "admin");
  const ana = await signIn(ctx, "surveyor", "Ana");
  const create = async (payload: object) =>
    CreateInviteResponse.parse(
      body(
        await ctx.app.inject({
          method: "POST",
          url: "/admin/invites",
          headers: admin.headers,
          payload,
        }),
      ),
    );
  const fresh = await create({ role: "surveyor" });
  const relogin = await create({ role: "surveyor", surveyor_id: ana.id });
  expect(fresh.url).toMatch(new RegExp(`^${WEB_ORIGIN}/invite/[A-Za-z0-9_-]{43}$`));
  expect(relogin.url).toMatch(new RegExp(`^${WEB_ORIGIN}/invite/[A-Za-z0-9_-]{43}\\?relogin=1$`));
});
