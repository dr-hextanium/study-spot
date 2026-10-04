import type { IdentitySection, SurveySpot } from "@study-spot/core";
import type {
  BinaryCache,
  Clock,
  Foreground,
  Ids,
  KeyValueCache,
  NetworkStatus,
  Timers,
} from "../adapters.ts";
import type { ApiResult, SurveyApi } from "./api.ts";
import { createOutboxStore } from "./outboxStore.ts";
import {
  LOCAL_PREFIX,
  type NewWrite,
  nextToSend,
  planEnqueue,
  rewriteSpotIds,
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

export type Outbox = ReturnType<typeof createOutbox>;

/**
 * The offline outbox (spec section 7): writes are saved on the phone first and
 * sent one at a time, oldest first. Survives the app being killed at any point:
 * a resend reuses its client_write_id and the server replays the stored answer.
 */
export function createOutbox(deps: OutboxDeps) {
  const store = createOutboxStore(deps);
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

  /** Photo bytes are stored first, so a queued upload always had them once. */
  async function enqueue(
    write: NewWrite,
    serverVersion: number | null,
    bytes: Uint8Array | null = null,
  ): Promise<string> {
    const meta = {
      client_write_id: deps.ids.uuid(),
      seq: await store.nextSeq(),
      created_at: deps.clock.now().toISOString(),
    };
    if (bytes !== null) await store.putPhoto(meta.client_write_id, bytes);
    const plan = planEnqueue(await store.list(), write, serverVersion, meta);
    for (const r of plan.put) await store.put(r);
    for (const id of plan.remove) await store.remove(id);
    if (plan.seedVersion !== null) await store.setVersion(write.spot_id, plan.seedVersion);
    await refresh();
    void sync();
    return plan.put[0]?.client_write_id ?? meta.client_write_id;
  }

  async function send(r: WriteRecord): Promise<SendResult> {
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
    // Version chaining: a write queued behind another takes that write's response version.
    const base_version = r.base_version ?? (await store.version(r.spot_id));
    if (base_version === null) return { kind: "local", code: "no_base_version" };
    switch (r.kind) {
      case "spot.section":
        return api.writeSection(r.spot_id, { client_write_id, base_version, write: r.payload });
      case "spot.verify":
        return api.verify(r.spot_id, { client_write_id, base_version, groups: r.payload.groups });
      case "spot.review":
        return api.review(r.spot_id, { client_write_id, base_version });
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

  /** Sends one write. Returns false when the pass should stop. */
  async function sendOne(r: WriteRecord): Promise<boolean> {
    const sending: WriteRecord = { ...r, state: "syncing", attempts: r.attempts + 1 };
    await store.put(sending);
    await refresh();
    const result = await send(sending);
    switch (result.kind) {
      case "ok":
        await applyOk(sending, result.value);
        return true;
      case "conflict":
        await conflict(sending, result.current);
        return true;
      case "invalid":
        await fail(sending, {
          status: result.status,
          code: result.code,
          message: result.message,
          missing: result.missing,
        });
        return true;
      case "gone":
        await fail(sending, { status: 410, code: result.code, message: null, missing: [] });
        return true;
      case "local":
        await fail(sending, { status: 0, code: result.code, message: null, missing: [] });
        return true;
      case "unauthorized":
        await store.put({ ...sending, state: "pending", attempts: r.attempts });
        emit({ signedOut: true });
        return false;
      case "server":
        if (result.reason === "bad_response") {
          // The server stored this answer, so a plain resend would replay it forever.
          await fail(sending, {
            status: result.status,
            code: "bad_response",
            message: null,
            missing: [],
          });
          return true;
        }
        await store.put({ ...sending, state: "pending" });
        return false;
      case "network":
        await store.put({ ...sending, state: "pending" });
        return false;
    }
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
        const next = nextToSend(await store.list());
        if (next === null) {
          cancelTimer?.();
          cancelTimer = null;
          return;
        }
        if (!(await sendOne(next))) {
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
    const r = (await store.list()).find((x) => x.client_write_id === clientWriteId);
    if (r) await fn(r);
    await refresh();
    void sync();
  }

  return {
    /** Loads the queue, resets writes cut off mid-send, and starts listening for triggers. */
    async start(): Promise<void> {
      stopped = false;
      const records = await store.list();
      for (const r of records) {
        if (r.state === "syncing") await store.put({ ...r, state: "pending" });
      }
      for (const moved of rewriteSpotIds(await store.list(), await store.idMap())) {
        await store.put(moved);
      }
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
