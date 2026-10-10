import { audit_log, bundle_state, type Db, write_receipt } from "@perch/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError } from "../http.ts";

/** A transaction handle. Drizzle transactions are databases too, so helpers take `Db`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type AuditEntry = {
  entity: string;
  entity_id: string;
  action: string;
  before: unknown;
  after: unknown;
};

export type WriteOutcome<T> = {
  status: 200 | 201;
  body: T;
  audit: AuditEntry | null;
  /** True when the write changes what the published bundle would contain. */
  dirty: boolean;
};

export type WriteResult<T> = { status: 200 | 201; body: T; replayed: boolean };

/** Anything that can be told a publish is due. The Publisher implements it. */
export type PublishQueue = { schedule(): void };

export type WriteDeps = { db: Db; campusId: string; publisher: PublishQueue };

export type WriteInfo<T> = {
  surveyorId: string;
  clientWriteId: string;
  /** Route-level name, e.g. "spot.section". A reused id with another kind is rejected. */
  kind: string;
  /** Response schema, used to re-validate a replayed body. */
  schema: z.ZodType<T>;
};

const StoredResponse = z.object({
  kind: z.string(),
  status: z.union([z.literal(200), z.literal(201)]),
  body: z.unknown(),
});

/**
 * Runs one client write exactly once.
 *
 * The receipt row is claimed first with INSERT ... ON CONFLICT DO NOTHING. A retry
 * that overlaps the original blocks on that row until the original commits, then
 * sees the stored response instead of running again. Anything thrown inside `fn`
 * (including 409 and 422 HttpErrors) rolls back the receipt with everything else,
 * so the client can retry with the same id.
 */
export async function withWrite<T>(
  deps: WriteDeps,
  info: WriteInfo<T>,
  fn: (tx: Tx) => Promise<WriteOutcome<T>>,
): Promise<WriteResult<T>> {
  const result = await deps.db.transaction(async (tx) => {
    const claimed = await tx
      .insert(write_receipt)
      .values({ client_write_id: info.clientWriteId, surveyor_id: info.surveyorId })
      .onConflictDoNothing()
      .returning({ id: write_receipt.client_write_id });

    if (claimed.length === 0) {
      const [prior] = await tx
        .select()
        .from(write_receipt)
        .where(eq(write_receipt.client_write_id, info.clientWriteId));
      const stored = StoredResponse.safeParse(prior?.response_json);
      if (
        !prior ||
        prior.surveyor_id !== info.surveyorId ||
        !stored.success ||
        stored.data.kind !== info.kind
      ) {
        throw new HttpError(422, {
          error: "write_id_reused",
          message: "This change id was already used for a different change.",
        });
      }
      const replayed = info.schema.parse(stored.data.body);
      return { status: stored.data.status, body: replayed, replayed: true, dirty: false };
    }

    const outcome = await fn(tx);
    // Parse once so the first response and every replay carry the same value.
    // A body that fails the schema throws here and rolls the whole write back.
    const body = info.schema.parse(outcome.body);
    if (outcome.audit) {
      await tx.insert(audit_log).values({
        surveyor_id: info.surveyorId,
        entity: outcome.audit.entity,
        entity_id: outcome.audit.entity_id,
        action: outcome.audit.action,
        before_json: outcome.audit.before,
        after_json: outcome.audit.after,
      });
    }
    await tx
      .update(write_receipt)
      .set({ response_json: { kind: info.kind, status: outcome.status, body } })
      .where(eq(write_receipt.client_write_id, info.clientWriteId));
    if (outcome.dirty) {
      await tx
        .insert(bundle_state)
        .values({ campus_id: deps.campusId, dirty: true, write_seq: 1 })
        .onConflictDoUpdate({
          target: bundle_state.campus_id,
          set: { dirty: true, write_seq: sql`${bundle_state.write_seq} + 1` },
        });
    }
    return { status: outcome.status, body, replayed: false, dirty: outcome.dirty };
  });

  if (result.dirty) deps.publisher.schedule();
  return { status: result.status, body: result.body, replayed: result.replayed };
}
