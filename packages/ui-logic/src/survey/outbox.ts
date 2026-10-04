import type { IdentitySection, SurveySpot } from "@study-spot/core";
import type {
  BinaryCache,
  Clock,
  Foreground,
  Ids,
  KeyValueCache,
  Lock,
  NetworkStatus,
  Timers,
} from "../adapters.ts";
import { createLocalLock } from "../lock.ts";
import type { ApiResult, SurveyApi } from "./api.ts";
import { createOutboxStore } from "./outboxStore.ts";
import {
  LOCAL_PREFIX,
  type NewWrite,
  nextToSend,
  planEnqueue,
  rewriteSpotIds,
  VERSIONED_KINDS,
  type WriteError,
  type WriteRecord,
} from "./writes.ts";

export const BACKOFF_START_MS = 30_000;
export const BACKOFF_MAX_MS = 300_000;

export type OutboxDeps = {
  cache: KeyValueCache;
  blobs: BinaryCache;
  api: SurveyApi;
  clock: Clock;
  ids: Ids;
  timers: Timers;
  network: NetworkStatus;
  foreground: Foreground;
  /**
   * Guards every read-modify-write of the queue. Defaults to an in-process lock;
   * apps/web passes a Web Locks one so tabs sharing storage take turns too.
   */
  lock?: Lock;
};

export type OutboxSnapshot = {
  /** Every queued write, oldest first. */
  records: readonly WriteRecord[];
  /** Local spot id to real id, for redirecting a screen opened on a local id. */
  idMap: Readonly<Record<string, string>>;
  syncing: boolean;
  /** True after a 401 until `resume()`; writes are kept. */
  signedOut: boolean;
  online: boolean;
  /** Stored records that fail to parse. They are never sent or deleted. */
  unreadable: number;
};

/** Writes a caller may queue for an existing spot (creates and photos have their own calls). */
export type SpotWrite = Exclude<NewWrite, { kind: "spot.create" } | { kind: "photo.upload" }>;
export type ConflictChoice = "mine" | "theirs";
type AppliedListener = (spot: SurveySpot, fromLocalId: string | null) => void;
type SendResult =
  | ApiResult<SurveySpot>
  | { kind: "local"; code: "photo_missing" | "no_base_version" };
type Step = "next" | "stop";

/** Lock name for the outbox's critical sections. */
export const OUTBOX_LOCK = "study-spot:outbox";

export type Outbox = ReturnType<typeof createOutbox>;

/**
 * The offline outbox (spec section 7): writes are saved on the phone first and
 * sent one at a time, oldest first. Survives the app being killed at any point:
 * a resend reuses its client_write_id and the server replays the stored answer.
 */
export function createOutbox(deps: OutboxDeps) {
  const store = createOutboxStore(deps);
  const lock = deps.lock ?? createLocalLock();
  /** Queue changes, the pick of the next write, and its result write never interleave. */
  const locked = <T>(fn: () => Promise<T>): Promise<T> => lock.run(OUTBOX_LOCK, fn);
  const listeners = new Set<() => void>();
  const applied = new Set<AppliedListener>();
  let snapshot: OutboxSnapshot = {
    records: [],
    idMap: {},
    syncing: false,
    signedOut: false,
    online: deps.network.online(),
    unreadable: 0,
  };
  let running: Promise<void> | null = null;
  let rerun = false;
  let backoff = BACKOFF_START_MS;
  let cancelTimer: (() => void) | null = null;
  let unsubscribe: (() => void)[] = [];
  let stopped = true;

  function emit(next: Partial<OutboxSnapshot>): void {
    snapshot = { ...snapshot, ...next };
    for (const l of listeners) l();
  }

  async function refresh(): Promise<WriteRecord[]> {
    const records = await store.list();
    const unreadable = (await store.unreadable()).length;
    emit({ records, idMap: await store.idMap(), unreadable });
    return records;
  }

  /**
   * Photo bytes are stored first, so a queued upload always had them once. A
   * local id whose create already applied is mapped to the real id first, since
   * a screen can still hold the local id.
   */
  async function enqueue(
    queued: NewWrite,
    serverVersion: number | null,
    bytes: Uint8Array | null = null,
  ): Promise<string> {
    const id = await locked(async () => {
      const real =
        queued.kind === "spot.create" ? undefined : (await store.idMap())[queued.spot_id];
      const write: NewWrite = real === undefined ? queued : { ...queued, spot_id: real };
      const meta = {
        client_write_id: deps.ids.uuid(),
        seq: await store.nextSeq(),
        created_at: deps.clock.now().toISOString(),
      };
      if (bytes !== null) await store.putPhoto(meta.client_write_id, bytes);
      const plan = planEnqueue(await store.list(), write, serverVersion, meta);
      for (const r of plan.put) await store.put(r);
      for (const removed of plan.remove) await store.remove(removed);
      if (plan.seedVersion !== null) await store.setVersion(write.spot_id, plan.seedVersion);
      return plan.put[0]?.client_write_id ?? meta.client_write_id;
    });
    await refresh();
    void sync();
    return id;
  }

  /** Sends one picked write. `base` is the base_version resolved when it was picked. */
  async function send(r: WriteRecord, base: number | null): Promise<SendResult> {
    const { api } = deps;
    const client_write_id = r.client_write_id;
    switch (r.kind) {
      case "spot.create":
        return api.createSpot({ client_write_id, identity: r.payload.identity });
      case "spot.publish":
        return api.publish(r.spot_id, { client_write_id });
      case "photo.cover":
        return api.setCover(r.payload.photo_id, { client_write_id });
      case "photo.upload": {
        const bytes = await store.photo(client_write_id);
        if (bytes === null) return { kind: "local", code: "photo_missing" };
        return api.uploadPhoto(
          { spot_id: r.spot_id, client_write_id, taken_at: r.payload.taken_at },
          bytes,
        );
      }
    }
    if (base === null) return { kind: "local", code: "no_base_version" };
    switch (r.kind) {
      case "spot.section":
        return api.writeSection(r.spot_id, {
          client_write_id,
          base_version: base,
          write: r.payload,
        });
      case "spot.verify":
        return api.verify(r.spot_id, {
          client_write_id,
          base_version: base,
          groups: r.payload.groups,
        });
      case "spot.review":
        return api.review(r.spot_id, { client_write_id, base_version: base });
    }
  }

  /** Order matters for a crash at any step: id map, version, rewrite, then delete. */
  async function applyOk(r: WriteRecord, spot: SurveySpot): Promise<void> {
    const fromLocal = r.kind === "spot.create" ? r.spot_id : null;
    if (fromLocal !== null) await store.mapId(fromLocal, spot.id);
    await store.setVersion(spot.id, spot.version);
    if (fromLocal !== null) {
      for (const moved of rewriteSpotIds(await store.list(), { [fromLocal]: spot.id })) {
        await store.put(moved);
      }
    }
    await store.remove(r.client_write_id);
    backoff = BACKOFF_START_MS;
    for (const l of applied) l(spot, fromLocal);
  }

  async function fail(r: WriteRecord, error: WriteError): Promise<void> {
    await store.put({ ...r, state: "failed", error });
  }

  /** Marks the write, and any later unsent write of the same section, as a conflict. */
  async function conflict(r: WriteRecord, current: SurveySpot): Promise<void> {
    await store.put({ ...r, state: "conflict", current });
    if (r.kind !== "spot.section") return;
    for (const later of await store.list()) {
      if (
        later.seq > r.seq &&
        later.spot_id === r.spot_id &&
        later.kind === "spot.section" &&
        later.payload.section === r.payload.section &&
        later.state === "pending"
      ) {
        await store.put({ ...later, state: "conflict", current });
      }
    }
  }

  /**
   * Under the lock: picks the next write, marks it as sending, and resolves its
   * base_version (version chaining: a write queued behind another takes that
   * write's response version). A spot with a write already in flight (another
   * tab's) is skipped, so two tabs never send the same write or race its followers.
   */
  function pick(): Promise<{ record: WriteRecord; base: number | null } | null> {
    return locked(async () => {
      const all = await store.list();
      const busy = new Set(all.filter((r) => r.state === "syncing").map((r) => r.spot_id));
      const next = nextToSend(all.filter((r) => !busy.has(r.spot_id)));
      if (next === null) return null;
      const record: WriteRecord = { ...next, state: "syncing", attempts: next.attempts + 1 };
      const versioned = VERSIONED_KINDS.includes(record.kind);
      const base = versioned
        ? (record.base_version ?? (await store.version(record.spot_id)))
        : null;
      await store.put(record);
      return { record, base };
    });
  }

  /**
   * Under the lock: records the answer for a sent write. If the write was
   * discarded or reset while in flight, it is left alone (never resurrected).
   */
  function settle(sent: WriteRecord, result: SendResult): Promise<Step> {
    return locked(async () => {
      const now = (await store.list()).find((x) => x.client_write_id === sent.client_write_id);
      const ours = now?.state === "syncing" && now.attempts === sent.attempts;
      switch (result.kind) {
        case "ok":
          if (ours) await applyOk(sent, result.value);
          return "next";
        case "conflict":
          if (ours) await conflict(sent, result.current);
          return "next";
        case "invalid":
          if (ours) {
            await fail(sent, {
              status: result.status,
              code: result.code,
              message: result.message,
              missing: result.missing,
            });
          }
          return "next";
        case "gone":
          if (ours) {
            await fail(sent, { status: 410, code: result.code, message: null, missing: [] });
          }
          return "next";
        case "local":
          if (ours) await fail(sent, { status: 0, code: result.code, message: null, missing: [] });
          return "next";
        case "unauthorized":
          if (ours) await store.put({ ...sent, state: "pending", attempts: sent.attempts - 1 });
          emit({ signedOut: true });
          return "stop";
        case "server":
          if (result.reason === "bad_response") {
            // The server stored this answer, so a plain resend would replay it forever.
            if (ours) {
              await fail(sent, {
                status: result.status,
                code: "bad_response",
                message: null,
                missing: [],
              });
            }
            return "next";
          }
          if (ours) await store.put({ ...sent, state: "pending" });
          return "stop";
        case "network":
          if (ours) await store.put({ ...sent, state: "pending" });
          return "stop";
      }
    });
  }

  function schedule(delay: number): void {
    cancelTimer?.();
    cancelTimer = deps.timers.after(delay, () => {
      cancelTimer = null;
      void sync();
    });
  }

  async function pass(): Promise<void> {
    if (stopped || snapshot.signedOut || !deps.network.online()) return;
    emit({ syncing: true });
    try {
      for (;;) {
        const picked = await pick();
        if (picked === null) {
          cancelTimer?.();
          cancelTimer = null;
          return;
        }
        await refresh();
        // The network call runs outside the lock, so saves and discards are never blocked by it.
        const result = await send(picked.record, picked.base);
        if ((await settle(picked.record, result)) === "stop") {
          if (!snapshot.signedOut) {
            schedule(backoff);
            backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
          }
          return;
        }
      }
    } catch {
      // Storage failed mid-pass; everything is still on disk, so try again later.
      schedule(backoff);
    } finally {
      await refresh().catch(() => undefined);
      emit({ syncing: false });
    }
  }

  /** Runs one pass at a time; triggers during a pass collapse into a single rerun. */
  function sync(): Promise<void> {
    if (running) {
      rerun = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          rerun = false;
          await pass();
        } while (rerun);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  async function update(clientWriteId: string, fn: (r: WriteRecord) => Promise<void>) {
    await locked(async () => {
      const r = (await store.list()).find((x) => x.client_write_id === clientWriteId);
      if (r) await fn(r);
    });
    await refresh();
    void sync();
  }

  return {
    /** Loads the queue, resets writes cut off mid-send, and starts listening for triggers. */
    async start(): Promise<void> {
      stopped = false;
      await locked(async () => {
        for (const r of await store.list()) {
          if (r.state === "syncing") await store.put({ ...r, state: "pending" });
        }
        for (const moved of rewriteSpotIds(await store.list(), await store.idMap())) {
          await store.put(moved);
        }
      });
      unsubscribe = [
        deps.network.subscribe((online) => {
          emit({ online });
          if (online) void sync();
        }),
        deps.foreground.subscribe(() => void sync()),
      ];
      await refresh();
      await sync();
    },
    stop(): void {
      stopped = true;
      for (const u of unsubscribe) u();
      unsubscribe = [];
      cancelTimer?.();
      cancelTimer = null;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Same object until something changes, as useSyncExternalStore requires. */
    getSnapshot: (): OutboxSnapshot => snapshot,
    /** Called with each spot the server returns, so the app can update its cached copy. */
    onApplied(listener: AppliedListener): () => void {
      applied.add(listener);
      return () => {
        applied.delete(listener);
      };
    },
    /** Queues a new draft and returns its local id. */
    async createSpot(identity: IdentitySection): Promise<string> {
      const spotId = `${LOCAL_PREFIX}${deps.ids.uuid()}`;
      await enqueue({ kind: "spot.create", spot_id: spotId, payload: { identity } }, null);
      return spotId;
    },
    /** Queues a write. `serverVersion` is the version the surveyor saw; null for a local spot. */
    enqueue: (write: SpotWrite, serverVersion: number | null): Promise<string> =>
      enqueue(write, serverVersion),
    addPhoto: (spotId: string, serverVersion: number | null, bytes: Uint8Array, takenAt: Date) =>
      enqueue(
        {
          kind: "photo.upload",
          spot_id: spotId,
          payload: { taken_at: takenAt.toISOString(), byte_size: bytes.byteLength },
        },
        serverVersion,
        bytes,
      ),
    /** Sends a failed write again with the same id (4xx answers are never stored). */
    retry: (clientWriteId: string) =>
      update(clientWriteId, async (r) => {
        if (r.state === "failed") await store.put({ ...r, state: "pending", error: null });
      }),
    /** Drops a write and its photo bytes; dropping a create drops everything queued for that draft. */
    discard: (clientWriteId: string) =>
      update(clientWriteId, async (r) => {
        const all = await store.list();
        const doomed = r.kind === "spot.create" ? all.filter((x) => x.spot_id === r.spot_id) : [r];
        for (const d of doomed) await store.remove(d.client_write_id);
      }),
    /**
     * Keep mine: send again on top of the server's version, with a new id.
     * Keep theirs: drop the write and adopt the server's spot.
     * Writes queued behind it chain from the server's version either way.
     */
    resolveConflict: (clientWriteId: string, choice: ConflictChoice) =>
      update(clientWriteId, async (r) => {
        if (r.state !== "conflict" || r.current === null) return;
        const current = r.current;
        await store.setVersion(current.id, current.version);
        if (choice === "mine") {
          const again = {
            client_write_id: deps.ids.uuid(),
            attempts: 0,
            state: "pending",
            error: null,
            current: null,
          } as const;
          // Only versioned writes (section, verify, review) can get a 409.
          await store.put(
            r.kind === "spot.section" || r.kind === "spot.verify" || r.kind === "spot.review"
              ? { ...r, ...again, base_version: current.version }
              : { ...r, ...again },
          );
        } else {
          for (const l of applied) l(current, null);
        }
        await store.remove(r.client_write_id);
      }),
    /** After signing in again on this phone. */
    resume(): void {
      emit({ signedOut: false });
      void sync();
    },
    syncNow: (): Promise<void> => sync(),
    /** Resolves when the current pass (if any) ends, without asking for another. */
    idle: (): Promise<void> => running ?? Promise.resolve(),
  };
}
