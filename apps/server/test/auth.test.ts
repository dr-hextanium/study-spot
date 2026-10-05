import { expect, test } from "bun:test";
import { AcceptInviteResponse, CreateInviteResponse } from "@study-spot/core";
import { auth_session, invite, surveyor } from "@study-spot/db";
import { eq } from "drizzle-orm";
import { bootstrapAdminInvite, createInvite } from "../src/auth/invites.ts";
import { SESSION_TTL_MS } from "../src/auth/sessions.ts";
import { hashToken } from "../src/auth/tokens.ts";
import { body, setup, signIn, type TestContext, WEB_ORIGIN } from "./helpers.ts";

const HOUR = 60 * 60 * 1000;

async function newInvite(ctx: TestContext, role: "surveyor" | "admin" = "surveyor") {
  return createInvite(ctx.db, {
    role,
    surveyorId: null,
    createdBy: ctx.ids.adminId,
    now: ctx.clock.now(),
    webOrigin: WEB_ORIGIN,
  });
}

function accept(ctx: TestContext, token: string, display_name?: string) {
  return ctx.app.inject({
    method: "POST",
    url: "/auth/accept",
    payload: display_name === undefined ? { token } : { token, display_name },
  });
}

test("an admin creates an invite link and only the hash is stored", async () => {
  const ctx = await setup();
  const admin = await signIn(ctx, "admin");
  const res = await ctx.app.inject({
    method: "POST",
    url: "/admin/invites",
    headers: admin.headers,
    payload: { role: "surveyor" },
  });
  expect(res.statusCode).toBe(200);
  const created = CreateInviteResponse.parse(body(res));
  expect(created.url.startsWith(`${WEB_ORIGIN}/invite/`)).toBe(true);
  expect(created.expires_at).toBe("2026-10-15T18:00:00.000Z");
  const token = created.url.slice(`${WEB_ORIGIN}/invite/`.length);
  const rows = await ctx.db.select().from(invite);
  expect(rows.map((r) => r.token_hash)).toEqual([hashToken(token)]);
  expect(JSON.stringify(rows)).not.toContain(token);
});

test("accepting creates the surveyor and a working session", async () => {
  const ctx = await setup();
  const inv = await newInvite(ctx);
  const res = await accept(ctx, inv.token, "  Ana  ");
  expect(res.statusCode).toBe(200);
  const accepted = AcceptInviteResponse.parse(body(res));
  expect(accepted.surveyor).toMatchObject({ display_name: "Ana", role: "surveyor", active: true });

  const me = await ctx.app.inject({
    method: "GET",
    url: "/auth/me",
    headers: { authorization: `Bearer ${accepted.token}` },
  });
  expect(me.statusCode).toBe(200);
  expect(body(me)).toEqual(accepted.surveyor);
  const [row] = await ctx.db.select().from(surveyor).where(eq(surveyor.id, accepted.surveyor.id));
  expect(row?.invited_by).toBe(ctx.ids.adminId);
});

test("a new-surveyor invite needs a display name and stays usable without one", async () => {
  const ctx = await setup();
  const inv = await newInvite(ctx);
  const res = await accept(ctx, inv.token);
  expect(res.statusCode).toBe(422);
  expect(body(res)).toMatchObject({ error: "display_name_required" });
  expect((await accept(ctx, inv.token, "Ana")).statusCode).toBe(200);
});

test("an invite cannot be reused, even by two concurrent accepts", async () => {
  const ctx = await setup();
  const inv = await newInvite(ctx);
  const [a, b] = await Promise.all([accept(ctx, inv.token, "A"), accept(ctx, inv.token, "B")]);
  expect([a.statusCode, b.statusCode].sort()).toEqual([200, 410]);
  const again = await accept(ctx, inv.token, "C");
  expect(again.statusCode).toBe(410);
  expect(body(again)).toEqual({ error: "invite_used" });
  const names = (await ctx.db.select().from(surveyor)).map((s) => s.display_name);
  expect(names.filter((n) => n === "A" || n === "B" || n === "C")).toHaveLength(1);
});

test("an invite expires exactly 48 hours after creation by the server clock", async () => {
  const ctx = await setup();
  const early = await newInvite(ctx);
  const late = await newInvite(ctx);
  ctx.clock.advance(48 * HOUR - 1);
  expect((await accept(ctx, early.token, "Ana")).statusCode).toBe(200);
  ctx.clock.advance(1);
  const res = await accept(ctx, late.token, "Bo");
  expect(res.statusCode).toBe(410);
  expect(body(res)).toEqual({ error: "invite_expired" });
});

test("an unknown or malformed token is rejected", async () => {
  const ctx = await setup();
  const unknown = await accept(ctx, "A".repeat(43), "Ana");
  expect(unknown.statusCode).toBe(410);
  expect(body(unknown)).toEqual({ error: "invite_invalid" });
  expect((await accept(ctx, "short", "Ana")).statusCode).toBe(400);
});

test("a re-login invite attaches to the existing surveyor", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const inv = await createInvite(ctx.db, {
    role: "surveyor",
    surveyorId: ana.id,
    createdBy: ctx.ids.adminId,
    now: ctx.clock.now(),
    webOrigin: WEB_ORIGIN,
  });
  const res = await accept(ctx, inv.token);
  expect(res.statusCode).toBe(200);
  const accepted = AcceptInviteResponse.parse(body(res));
  expect(accepted.surveyor.id).toBe(ana.id);
  expect(accepted.surveyor.display_name).toBe("Ana");
  expect(accepted.token).not.toBe(ana.token);
});

test("revoke ends sessions, voids open invites, and blocks the surveyor", async () => {
  const ctx = await setup();
  const admin = await signIn(ctx, "admin", "Admin");
  const ana = await signIn(ctx, "surveyor", "Ana");
  const pending = await createInvite(ctx.db, {
    role: "surveyor",
    surveyorId: ana.id,
    createdBy: admin.id,
    now: ctx.clock.now(),
    webOrigin: WEB_ORIGIN,
  });
  const res = await ctx.app.inject({
    method: "POST",
    url: `/admin/surveyors/${ana.id}/revoke`,
    headers: admin.headers,
  });
  expect(res.statusCode).toBe(200);
  expect(body(res)).toMatchObject({ id: ana.id, active: false });
  expect(
    await ctx.db.select().from(auth_session).where(eq(auth_session.surveyor_id, ana.id)),
  ).toEqual([]);
  expect(
    (await ctx.app.inject({ method: "GET", url: "/auth/me", headers: ana.headers })).statusCode,
  ).toBe(401);
  // A link issued before the revoke must not bring the surveyor back.
  expect((await accept(ctx, pending.token)).statusCode).toBe(410);

  const self = await ctx.app.inject({
    method: "POST",
    url: `/admin/surveyors/${admin.id}/revoke`,
    headers: admin.headers,
  });
  expect(self.statusCode).toBe(403);
});

test("401 without a valid session, 403 for a surveyor on admin routes", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx);
  const create = (headers: Record<string, string>) =>
    ctx.app.inject({ method: "POST", url: "/admin/invites", headers, payload: { role: "admin" } });
  expect((await create({})).statusCode).toBe(401);
  expect((await create({ authorization: "Bearer nope" })).statusCode).toBe(401);
  expect((await create({ authorization: `Basic ${ana.token}` })).statusCode).toBe(401);
  const forbidden = await create(ana.headers);
  expect(forbidden.statusCode).toBe(403);
  expect(body(forbidden)).toEqual({ error: "forbidden" });
});

test("sessions expire at 30 days exactly and renew past the halfway point", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx);
  const me = () => ctx.app.inject({ method: "GET", url: "/auth/me", headers: ana.headers });
  const expiry = async () =>
    (await ctx.db.select().from(auth_session).where(eq(auth_session.surveyor_id, ana.id)))[0]
      ?.expires_at;
  const start = ctx.clock.now().getTime();

  ctx.clock.advance(SESSION_TTL_MS / 2);
  expect((await me()).statusCode).toBe(200);
  expect((await expiry())?.getTime()).toBe(start + SESSION_TTL_MS);

  ctx.clock.advance(1);
  expect((await me()).statusCode).toBe(200);
  const renewed = start + SESSION_TTL_MS / 2 + 1 + SESSION_TTL_MS;
  expect((await expiry())?.getTime()).toBe(renewed);

  ctx.clock.set(new Date(renewed));
  expect((await me()).statusCode).toBe(401);
});

test("logout deletes only the current session", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx);
  const out = await ctx.app.inject({ method: "POST", url: "/auth/logout", headers: ana.headers });
  expect(out.statusCode).toBe(204);
  expect(
    (await ctx.app.inject({ method: "GET", url: "/auth/me", headers: ana.headers })).statusCode,
  ).toBe(401);
});

test("bootstrap creates an admin and a re-login link for them", async () => {
  const ctx = await setup();
  const created = await bootstrapAdminInvite(ctx.db, {
    displayName: "Founder",
    now: ctx.clock.now(),
    webOrigin: WEB_ORIGIN,
  });
  const res = await accept(ctx, created.token);
  expect(res.statusCode).toBe(200);
  expect(AcceptInviteResponse.parse(body(res)).surveyor).toMatchObject({
    display_name: "Founder",
    role: "admin",
  });
});

test("revoke also voids unused invites the surveyor created", async () => {
  const ctx = await setup();
  const adminA = await signIn(ctx, "admin", "Admin A");
  const adminB = await signIn(ctx, "admin", "Admin B");
  const minted = await createInvite(ctx.db, {
    role: "admin",
    surveyorId: null,
    createdBy: adminA.id,
    now: ctx.clock.now(),
    webOrigin: WEB_ORIGIN,
  });
  const before = (await ctx.db.select().from(surveyor)).length;
  const res = await ctx.app.inject({
    method: "POST",
    url: `/admin/surveyors/${adminA.id}/revoke`,
    headers: adminB.headers,
  });
  expect(res.statusCode).toBe(200);
  const again = await accept(ctx, minted.token, "Sneaky");
  expect(again.statusCode).toBe(410);
  expect(body(again)).toEqual({ error: "invite_invalid" });
  expect(await ctx.db.select().from(surveyor)).toHaveLength(before);
});

test("a re-login link keeps the role, a new-surveyor invite applies its role", async () => {
  const ctx = await setup();
  const boss = await signIn(ctx, "admin", "Boss");
  const inv = await createInvite(ctx.db, {
    role: "surveyor",
    surveyorId: boss.id,
    createdBy: ctx.ids.adminId,
    now: ctx.clock.now(),
    webOrigin: WEB_ORIGIN,
  });
  const res = await accept(ctx, inv.token);
  expect(AcceptInviteResponse.parse(body(res)).surveyor).toMatchObject({
    id: boss.id,
    role: "admin",
  });
  const [row] = await ctx.db.select().from(surveyor).where(eq(surveyor.id, boss.id));
  expect(row?.role).toBe("admin");

  const fresh = await newInvite(ctx, "admin");
  const made = await accept(ctx, fresh.token, "New Admin");
  expect(AcceptInviteResponse.parse(body(made)).surveyor.role).toBe("admin");
});
