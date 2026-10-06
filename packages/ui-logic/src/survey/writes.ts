import {
  AttributeGroup,
  BaseVersion,
  ClientWriteId,
  IdentitySection,
  SectionWrite,
  SurveySpot,
  V0_FIELD,
} from "@study-spot/core";
import { z } from "zod";

/*
 * Outbox write records (spec section 7). Pure: no storage, no network.
 */

export const LOCAL_PREFIX = "local:";
export const LocalSpotId = z.string().regex(/^local:[0-9a-f-]{36}$/);
export const SpotRef = z.union([z.uuid(), LocalSpotId]);

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_PREFIX);
}

export const WRITE_STATE = ["pending", "syncing", "failed", "conflict"] as const;
export const WriteState = z.enum(WRITE_STATE);
export type WriteState = z.infer<typeof WriteState>;

export const WriteError = z.object({
  /** HTTP status, or 0 for a local error. */
  status: z.number().int().nonnegative(),
  /** ApiErrorCode, a local code (photo_missing, photo_unreadable, bad_response, no_base_version), or null. */
  code: z.string().nullable(),
  message: z.string().nullable(),
  missing: z.array(z.enum(V0_FIELD)),
});
export type WriteError = z.infer<typeof WriteError>;

/** Record shape version. Absent on records stored before it existed; those are version 1. */
export const WRITE_RECORD_VERSION = 1;

const Common = {
  /**
   * Shape version, so a later release can migrate stored records. A record from a
   * newer shape fails to parse and is kept as unreadable, never sent or lost.
   */
  v: z.literal(WRITE_RECORD_VERSION).optional(),
  client_write_id: ClientWriteId,
  spot_id: SpotRef,
  /** Queue order. Monotonic, so a clock moving backwards never reorders writes. */
  seq: z.number().int().nonnegative(),
  created_at: z.iso.datetime(),
  /** Sends started. Above 0 means the server may hold a receipt for this id. */
  attempts: z.number().int().nonnegative(),
  state: WriteState,
  /**
   * The context that marked the write `syncing` (Liveness owner id). Only read
   * while `syncing`; absent on records stored before it existed.
   */
  owner: z.string().min(1).nullable().optional(),
  error: WriteError.nullable(),
  /** The server's spot from a 409, shown in the conflict view. */
  current: SurveySpot.nullable(),
};

/** `base_version` null on a versioned write means "chain from the previous write's response". */
export const WriteRecord = z.discriminatedUnion("kind", [
  z.object({
    ...Common,
    kind: z.literal("spot.create"),
    base_version: z.null(),
    payload: z.object({ identity: IdentitySection }),
  }),
  z.object({
    ...Common,
    kind: z.literal("spot.section"),
    base_version: BaseVersion.nullable(),
    payload: SectionWrite,
  }),
  z.object({
    ...Common,
    kind: z.literal("spot.verify"),
    base_version: BaseVersion.nullable(),
    payload: z.object({ groups: z.array(AttributeGroup).min(1) }),
  }),
  z.object({
    ...Common,
    kind: z.literal("spot.review"),
    base_version: BaseVersion.nullable(),
    payload: z.object({}),
  }),
  z.object({
    ...Common,
    kind: z.literal("spot.publish"),
    base_version: z.null(),
    payload: z.object({}),
  }),
  z.object({
    ...Common,
    kind: z.literal("photo.upload"),
    base_version: z.null(),
    payload: z.object({ taken_at: z.iso.datetime(), byte_size: z.number().int().positive() }),
  }),
  z.object({
    ...Common,
    kind: z.literal("photo.cover"),
    base_version: z.null(),
    payload: z.object({ photo_id: z.uuid() }),
  }),
]);
export type WriteRecord = z.infer<typeof WriteRecord>;
export type WriteKind = WriteRecord["kind"];

/** Writes whose request carries base_version (plan A: section, verify, review). */
export const VERSIONED_KINDS: readonly WriteKind[] = ["spot.section", "spot.verify", "spot.review"];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** What a caller asks to queue; the outbox fills in the bookkeeping. */
export type NewWrite = DistributiveOmit<
  WriteRecord,
  | "client_write_id"
  | "seq"
  | "created_at"
  | "attempts"
  | "state"
  | "error"
  | "current"
  | "base_version"
  | "owner"
>;

export function bySeq(a: WriteRecord, b: WriteRecord): number {
  return a.seq - b.seq || (a.client_write_id < b.client_write_id ? -1 : 1);
}

export type EnqueuePlan = {
  put: WriteRecord[];
  remove: string[];
  /** Version to remember for this spot when no earlier write chains it. */
  seedVersion: number | null;
};

/**
 * Decides how a new write joins the queue.
 * - Basics saved for a draft whose create is unsent or was refused edits the create.
 * - The first write for a spot takes the version the surveyor saw; later ones chain (null).
 * - A section saved again replaces its unsent copy in place, or replaces a failed or
 *   conflicted copy with a new id at the back (a conflict rebases onto the server's version).
 * - A second publish or review for a spot is a no-op.
 */
export function planEnqueue(
  existing: readonly WriteRecord[],
  write: NewWrite,
  serverVersion: number | null,
  meta: { client_write_id: string; seq: number; created_at: string },
): EnqueuePlan {
  const sameSpot = existing.filter((r) => r.spot_id === write.spot_id);
  if (write.kind === "spot.publish" || write.kind === "spot.review") {
    if (sameSpot.some((r) => r.kind === write.kind && r.state !== "failed")) {
      return { put: [], remove: [], seedVersion: null };
    }
  }
  // Saving Basics before the create has gone through (or after it was refused,
  // e.g. slug_taken) edits the create itself; no server receipt exists for it.
  const create = sameSpot.find((r) => r.kind === "spot.create");
  if (
    write.kind === "spot.section" &&
    write.payload.section === "identity" &&
    create?.kind === "spot.create" &&
    (create.attempts === 0 || (create.state === "failed" && (create.error?.status ?? 0) >= 400))
  ) {
    const identity = write.payload.data;
    return {
      put: [{ ...create, payload: { identity }, state: "pending", error: null }],
      remove: [],
      seedVersion: null,
    };
  }
  let replaced: WriteRecord | undefined;
  if (write.kind === "spot.section") {
    replaced = sameSpot
      .filter(
        (r) =>
          r.kind === "spot.section" &&
          r.payload.section === write.payload.section &&
          r.state !== "syncing",
      )
      .sort(bySeq)
      .at(-1);
    if (replaced?.kind === "spot.section" && replaced.attempts === 0) {
      return {
        put: [
          { ...replaced, payload: write.payload, state: "pending", error: null, current: null },
        ],
        remove: [],
        seedVersion: null,
      };
    }
  }
  const others = sameSpot.filter((r) => r !== replaced);
  const chained = others.length > 0;
  const versioned = VERSIONED_KINDS.includes(write.kind);
  // A re-saved conflict rebases on the server's version; later writes chain from it.
  const rebase =
    versioned && replaced?.state === "conflict" ? (replaced.current?.version ?? null) : null;
  const seed = rebase ?? serverVersion;
  const base: number | null = versioned && !chained ? seed : null;
  const record = WriteRecord.parse({
    ...write,
    ...meta,
    v: WRITE_RECORD_VERSION,
    base_version: base,
    attempts: 0,
    state: "pending",
    error: null,
    current: null,
  });
  return {
    put: [record],
    remove: replaced ? [replaced.client_write_id] : [],
    seedVersion: rebase !== null ? rebase : chained ? null : serverVersion,
  };
}

function waiting(r: WriteRecord): boolean {
  return r.state === "failed" || r.state === "conflict";
}

function eligible(r: WriteRecord, all: readonly WriteRecord[]): boolean {
  if (waiting(r)) return false;
  if (isLocalId(r.spot_id) && r.kind !== "spot.create") return false;
  if (r.kind === "photo.upload") return true;
  // Text writes wait behind an earlier failed or conflicted text write on the same spot.
  return !all.some(
    (o) => o.spot_id === r.spot_id && o.kind !== "photo.upload" && waiting(o) && bySeq(o, r) < 0,
  );
}

/**
 * The next write to send: oldest first, a spot's create before anything else for it,
 * that spot's photos before its text writes, and nothing behind a failure on the same spot.
 */
export function nextToSend(records: readonly WriteRecord[]): WriteRecord | null {
  const sorted = [...records].sort(bySeq);
  for (const r of sorted) {
    if (!eligible(r, sorted)) continue;
    if (r.kind !== "photo.upload" && r.kind !== "spot.create") {
      const photo = sorted.find(
        (p) => p.kind === "photo.upload" && p.spot_id === r.spot_id && eligible(p, sorted),
      );
      if (photo) return photo;
    }
    return r;
  }
  return null;
}

/** Points writes queued under a local id at the real id. Creates keep their local id. */
export function rewriteSpotIds(
  records: readonly WriteRecord[],
  idMap: Readonly<Record<string, string>>,
): WriteRecord[] {
  const changed: WriteRecord[] = [];
  for (const r of records) {
    const real = idMap[r.spot_id];
    if (r.kind !== "spot.create" && real !== undefined) changed.push({ ...r, spot_id: real });
  }
  return changed;
}
