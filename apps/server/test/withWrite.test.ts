import { expect, test } from "bun:test";
import { audit_log, bundle_state, spot, write_receipt } from "@study-spot/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "../src/http.ts";
import { type Tx, type WriteOutcome, withWrite } from "../src/writes/withWrite.ts";
import { setup, signIn, type TestContext, writeId } from "./helpers.ts";

const Body = z.object({ name: z.string() });
type Body = z.infer<typeof Body>;

function deps(ctx: TestContext) {
  return { db: ctx.db, campusId: "sbu", publisher: ctx.publisher };
}

/** Renames the seed draft spot, so effects are visible and roll back. */
function rename(
  ctx: TestContext,
  name: string,
  opts: { dirty?: boolean; failAfter?: boolean } = {},
) {
  let calls = 0;
  const fn = async (tx: Tx): Promise<WriteOutcome<Body>> => {
    calls += 1;
    await tx
      .update(spot)
      .set({ official_name: name })
      .where(eq(spot.id, ctx.ids.spotIds["union-draft"]));
    if (opts.failAfter) throw new Error("crash after a partial write");
    return {
      status: 201,
      body: { name },
      audit: { entity: "spot", entity_id: "x", action: "rename", before: null, after: { name } },
      dirty: opts.dirty ?? false,
    };
  };
  return { fn, calls: () => calls };
}

async function draftName(ctx: TestContext): Promise<string | undefined> {
  const [row] = await ctx.db.select().from(spot).where(eq(spot.id, ctx.ids.spotIds["union-draft"]));
  return row?.official_name;
}

test("a write runs once; a replay returns the stored response without running", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const id = writeId();
  const info = { surveyorId: me.id, clientWriteId: id, kind: "test.rename", schema: Body };
  const first = rename(ctx, "First");
  expect(await withWrite(deps(ctx), info, first.fn)).toEqual({
    status: 201,
    body: { name: "First" },
    replayed: false,
  });
  const second = rename(ctx, "Second");
  expect(await withWrite(deps(ctx), info, second.fn)).toEqual({
    status: 201,
    body: { name: "First" },
    replayed: true,
  });
  expect(second.calls()).toBe(0);
  expect(await draftName(ctx)).toBe("First");
  expect(await ctx.db.select().from(audit_log)).toHaveLength(1);
  const [receipt] = await ctx.db.select().from(write_receipt);
  expect(receipt?.response_json).toEqual({
    kind: "test.rename",
    status: 201,
    body: { name: "First" },
  });
});

test("a crash mid-transaction leaves no receipt, audit, or partial data", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const info = { surveyorId: me.id, clientWriteId: writeId(), kind: "test.rename", schema: Body };
  await expect(
    withWrite(deps(ctx), info, rename(ctx, "Half", { failAfter: true }).fn),
  ).rejects.toThrow("crash after a partial write");
  expect(await draftName(ctx)).toBe("Union Lobby Tables");
  expect(await ctx.db.select().from(write_receipt)).toEqual([]);
  expect(await ctx.db.select().from(audit_log)).toEqual([]);

  // The client retries the same id after the crash and it runs for real.
  const retry = rename(ctx, "Whole");
  const result = await withWrite(deps(ctx), info, retry.fn);
  expect(result.replayed).toBe(false);
  expect(retry.calls()).toBe(1);
  expect(await draftName(ctx)).toBe("Whole");
});

test("an HttpError such as a 409 is not stored, so the same id can succeed later", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const info = { surveyorId: me.id, clientWriteId: writeId(), kind: "test.rename", schema: Body };
  const conflict = async (): Promise<WriteOutcome<Body>> => {
    throw new HttpError(409, { error: "version_conflict" });
  };
  await expect(withWrite(deps(ctx), info, conflict)).rejects.toThrow(HttpError);
  expect(await ctx.db.select().from(write_receipt)).toEqual([]);
  expect((await withWrite(deps(ctx), info, rename(ctx, "Later").fn)).replayed).toBe(false);
});

test("an id reused by another surveyor or another kind is rejected", async () => {
  const ctx = await setup();
  const ana = await signIn(ctx, "surveyor", "Ana");
  const bo = await signIn(ctx, "surveyor", "Bo");
  const id = writeId();
  await withWrite(
    deps(ctx),
    { surveyorId: ana.id, clientWriteId: id, kind: "test.rename", schema: Body },
    rename(ctx, "Ana's").fn,
  );
  const asBo = withWrite(
    deps(ctx),
    { surveyorId: bo.id, clientWriteId: id, kind: "test.rename", schema: Body },
    rename(ctx, "Bo's").fn,
  );
  await expect(asBo).rejects.toMatchObject({ status: 422, body: { error: "write_id_reused" } });
  const otherKind = withWrite(
    deps(ctx),
    { surveyorId: ana.id, clientWriteId: id, kind: "test.other", schema: Body },
    rename(ctx, "Other").fn,
  );
  await expect(otherKind).rejects.toMatchObject({ status: 422 });
  expect(await draftName(ctx)).toBe("Ana's");
});

test("a dirty write marks the bundle, bumps write_seq, and schedules a publish once", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const info = { surveyorId: me.id, clientWriteId: writeId(), kind: "test.rename", schema: Body };
  await withWrite(deps(ctx), info, rename(ctx, "A", { dirty: true }).fn);
  await withWrite(deps(ctx), info, rename(ctx, "A", { dirty: true }).fn);
  await withWrite(
    deps(ctx),
    { ...info, clientWriteId: writeId() },
    rename(ctx, "B", { dirty: true }).fn,
  );
  await withWrite(deps(ctx), { ...info, clientWriteId: writeId() }, rename(ctx, "C").fn);
  const [state] = await ctx.db.select().from(bundle_state).where(eq(bundle_state.campus_id, "sbu"));
  expect(state?.dirty).toBe(true);
  expect(state?.write_seq).toBe(2);
  expect(ctx.publisher.scheduled).toBe(2);
});

test("two concurrent sends of the same id run the write once", async () => {
  const ctx = await setup();
  const me = await signIn(ctx);
  const info = { surveyorId: me.id, clientWriteId: writeId(), kind: "test.rename", schema: Body };
  const a = rename(ctx, "A");
  const b = rename(ctx, "B");
  const [ra, rb] = await Promise.all([
    withWrite(deps(ctx), info, a.fn),
    withWrite(deps(ctx), info, b.fn),
  ]);
  expect(a.calls() + b.calls()).toBe(1);
  expect(ra.body).toEqual(rb.body);
  expect([ra.replayed, rb.replayed].sort()).toEqual([false, true]);
});
