import type { IdentitySection, SurveySpot } from "@study-spot/core";
import type {
  BinaryCache,
  Clock,
  Foreground,
  Ids,
  KeyValueCache,
  Liveness,
  Lock,
  NetworkStatus,
  QueueSignal,
  Timers,
} from "../adapters.ts";
import { createLocalLiveness, createLocalSignal } from "../liveness.ts";
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
  type WriteKind,
  type WriteRecord,
} from "./writes.ts";

export const BACKOFF_START_MS = 30_000;
export const BACKOFF_MAX_MS = 300_000;
/** How soon a pass looks again at a spot another live tab is sending. */
/** Photo reads that may fail in a row before the upload is marked failed (photo_unreadable). */
export const PHOTO_READ_MAX_FAILURES = 5;
export const HELD_RECHECK_MS = 15_000;

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
  /**
   * Tells whether the tab that marked a write `syncing` still runs. Defaults to
   * an in-process registry shared by outboxes on the same cache; apps/web
   * passes a Web Locks one.
   */
  liveness?: Liveness;
  /** Wakes other tabs when the queue changes. Defaults to in-process; apps/web uses BroadcastChannel. */
  signal?: QueueSignal;
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
  /** Stored records that fail to parse. Never sent; deleted only by `discardUnreadable`. */
  unreadable: number;
  /** False until the queue was read from storage once. Before that, `records` is empty by default, not by fact. */
  loaded: boolean;
};

/** Writes a caller may queue for an existing spot (creates and photos have their own calls). */
export type SpotWrite = Exclude<NewWrite, { kind: "spot.create" } | { kind: "photo.upload" }>;
export type ConflictChoice = "mine" | "theirs";
/** The queued write whose server answer is being reported. */
export type AppliedWrite = { client_write_id: string; kind: WriteKind };
/**
 * `write` is the write the server applied, so the UI can tie a toast to it. It is
 * null when no write applied: Keep theirs adopting the server's copy.
 */
export type AppliedListener = (
  spot: SurveySpot,
  fromLocalId: string | null,
  write: AppliedWrite | null,
) => void;
type SendResult =
  | ApiResult<SurveySpot>
  | { kind: "local"; code: "photo_missing" | "photo_unreadable" | "no_base_version" };
/** After a write: go on, hold that spot for the rest of the pass, or end the pass. */
type Step = "next" | "skip" | "stop";

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
  let liveness = deps.liveness ?? createLocalLiveness(deps.cache, deps.ids);
  const signal = deps.signal ?? createLocalSignal(deps.cache);
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
    loaded: false,
  };
  /**
   * This tab's Liveness owner id, set by start(). Passes in a tab are serial,
   * so at pick time a `syncing` write owned by this tab was cut off by a
   * storage error and is sent again; only another live tab's write makes a
   * spot busy. A write whose owner is gone (closed tab, earlier run) is sent again.
   */
  let self: string | null = null;
  let running: Promise<void> | null = null;
  let rerun = false;
  let backoff = BACKOFF_START_MS;
  let cancelTimer: (() => void) | null = null;
  let unsubscribe: (() => void)[] = [];
  let stopped = true;
  /** False until start() finished its recovery step; passes wait for it. */
  let ready = false;
  let cancelLoad: (() => void) | null = null;
  /** Consecutive failed photo reads per write, in this tab only. */
  const unreadPhotos = new Map<string, number>();

  function emit(next: Partial<OutboxSnapshot>): void {
    snapshot = { ...snapshot, ...next };
    for (const l of listeners) l();
  }

  /** Numbers each read as it starts; a read never emits after a later-started one has. */
  let reads = 0;
  let emitted = 0;

  async function refresh(): Promise<WriteRecord[]> {
    reads += 1;
    const mine = reads;
    const records = await store.list();
    const unreadable = (await store.unreadable()).length;
    const idMap = await store.idMap();
    if (mine > emitted) {
      emitted = mine;
      emit({ records, idMap, unreadable, loaded: true });
    }
    return records;
  }

  /** First read of the queue; a failure is tried again later, so the header does not stay on Checking. */
  function load(): void {
    cancelLoad = null;
    refresh().catch(() => {
      if (!stopped) cancelLoad = deps.timers.after(BACKOFF_START_MS, load);
    });
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
    fixedId: string | null = null,
    once = false,
  ): Promise<string> {
    const id = await locked(async () => {
      // A caller that picked the id retries safely: a write already stored under it, or a
      // create whose local id is stored or already applied (in the map), is not queued twice.
      if (once) {
        const stored = (await store.list()).find((r) =>
          queued.kind === "spot.create"
            ? r.spot_id === queued.spot_id
            : r.client_write_id === fixedId,
        );
        if (stored !== undefined) return stored.client_write_id;
        if (queued.kind === "spot.create" && (await store.idMap())[queued.spot_id] !== undefined) {
          return queued.spot_id;
        }
      }
      const real =
        queued.kind === "spot.create" ? undefined : (await store.idMap())[queued.spot_id];
      const write: NewWrite = real === undefined ? queued : { ...queued, spot_id: real };
      // A cached copy can be older than an answer this phone already applied; never seed below it.
      const known = serverVersion === null ? null : await store.version(write.spot_id);
      const seen = serverVersion === null ? null : Math.max(serverVersion, known ?? 0);
      const meta = {
        client_write_id: fixedId ?? deps.ids.uuid(),
        seq: await store.nextSeq(),
        created_at: deps.clock.now().toISOString(),
      };
      if (bytes !== null) await store.putPhoto(meta.client_write_id, bytes);
      const plan = planEnqueue(await store.list(), write, seen, meta);
      for (const r of plan.put) await store.put(r);
      for (const removed of plan.remove) await store.remove(removed);
      if (plan.seedVersion !== null) await raiseVersion(write.spot_id, plan.seedVersion);
      return plan.put[0]?.client_write_id ?? plan.existing ?? meta.client_write_id;
    });
    await refresh();
    // Start this tab's pass before waking the others, so the tab that queued a write sends it.
    void sync();
    signal.post();
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
        let bytes: Uint8Array | null;
        try {
          bytes = await store.photo(client_write_id);
        } catch {
          // The read failed or timed out: the bytes may be fine, so keep the write queued.
          // Only this spot waits (like a 5xx), so the rest of the queue still sends.
          const failures = (unreadPhotos.get(client_write_id) ?? 0) + 1;
          if (failures < PHOTO_READ_MAX_FAILURES) {
            unreadPhotos.set(client_write_id, failures);
            return { kind: "server", status: 0, reason: "status" };
          }
          unreadPhotos.delete(client_write_id);
          return { kind: "local", code: "photo_unreadable" };
        }
        unreadPhotos.delete(client_write_id);
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

  /**
   * Stores `version` unless a newer one is already known (a late replay, another
   * tab). Returns false when the stored version is newer, so the caller can skip
   * pushing a stale spot to onApplied.
   */
  async function raiseVersion(spotId: string, version: number): Promise<boolean> {
    const stored = await store.version(spotId);
    if (stored !== null && stored > version) return false;
    if (stored !== version) await store.setVersion(spotId, version);
    return true;
  }

  function notify(spot: SurveySpot, fromLocal: string | null, r: WriteRecord | null): void {
    const write = r === null ? null : { client_write_id: r.client_write_id, kind: r.kind };
    for (const l of applied) l(spot, fromLocal, write);
  }

  /** Order matters for a crash at any step: id map, version, rewrite, then delete. */
  async function applyOk(r: WriteRecord, spot: SurveySpot): Promise<void> {
    const fromLocal = r.kind === "spot.create" ? r.spot_id : null;
    if (fromLocal !== null) await store.mapId(fromLocal, spot.id);
    const fresh = await raiseVersion(spot.id, spot.version);
    if (fromLocal !== null) {
      for (const moved of rewriteSpotIds(await store.list(), { [fromLocal]: spot.id })) {
        await store.put(moved);
      }
    }
    await store.remove(r.client_write_id);
    if (fresh) notify(spot, fromLocal, r);
  }

  async function fail(r: WriteRecord, error: WriteError): Promise<void> {
    await store.put({ ...r, state: "failed", error });
  }

  /**
   * Marks the write as a conflict. A section write replaces the whole section,
   * so later unsent copies of the same section fold into this one conflict,
   * which carries the newest payload. Otherwise Keep mine on each copy would send
   * a stale one and the last would conflict with its own sibling.
   */
  async function conflict(r: WriteRecord, current: SurveySpot): Promise<void> {
    if (r.kind !== "spot.section") {
      await store.put({ ...r, state: "conflict", current });
      return;
    }
    const later = (await store.list()).filter(
      (x) =>
        x.seq > r.seq &&
        x.spot_id === r.spot_id &&
        x.kind === "spot.section" &&
        x.payload.section === r.payload.section &&
        x.state === "pending",
    );
    const newest = later.at(-1);
    const payload = newest?.kind === "spot.section" ? newest.payload : r.payload;
    await store.put({ ...r, payload, state: "conflict", current });
    for (const x of later) await store.remove(x.client_write_id);
  }

  /** True when another tab that is still running marked this write as sending. */
  async function sendingElsewhere(r: WriteRecord): Promise<boolean> {
    if (r.state !== "syncing" || r.owner == null || r.owner === self) return false;
    return liveness.alive(r.owner);
  }

  /**
   * Under the lock: picks the next write, marks it as sending, and resolves its
   * base_version (version chaining: a write queued behind another takes that
   * write's response version). A spot with a write in flight in another live tab
   * is skipped, so two tabs never send the same write or race its followers;
   * `held` says so, for the recheck timer. A gone tab's write is taken over.
   */
  function pick(
    skipped: ReadonlySet<string>,
  ): Promise<{ next: { record: WriteRecord; base: number | null } | null; held: boolean }> {
    return locked(async () => {
      const all = await store.list();
      const busy = new Set(skipped);
      let held = false;
      for (const r of all) {
        if (!busy.has(r.spot_id) && (await sendingElsewhere(r))) {
          busy.add(r.spot_id);
          held = true;
        }
      }
      const next = nextToSend(all.filter((r) => !busy.has(r.spot_id)));
      if (next === null) return { next: null, held };
      const record: WriteRecord = {
        ...next,
        state: "syncing",
        attempts: next.attempts + 1,
        owner: self,
      };
      const versioned = VERSIONED_KINDS.includes(record.kind);
      const base = versioned
        ? (record.base_version ?? (await store.version(record.spot_id)))
        : null;
      await store.put(record);
      return { next: { record, base }, held };
    });
  }

  /**
   * Under the lock: records the answer for a sent write. If the write was
   * discarded or reset while in flight, it is left alone (never resurrected).
   */
  function settle(sent: WriteRecord, result: SendResult): Promise<Step> {
    return locked(async () => {
      const now = (await store.list()).find((x) => x.client_write_id === sent.client_write_id);
      // Another tab may have taken the write over (this tab looked gone), so match the owner too.
      const ours =
        now?.state === "syncing" && now.attempts === sent.attempts && now.owner === sent.owner;
      switch (result.kind) {
        case "ok":
          if (ours) await applyOk(sent, result.value);
          else if (
            sent.kind !== "spot.create" &&
            (await raiseVersion(result.value.id, result.value.version))
          ) {
            // Discarded in flight but applied anyway: later writes must chain from it.
            notify(result.value, null, sent);
          }
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
          // The server is up but failing for this write; other spots can still go.
          if (ours) await store.put({ ...sent, state: "pending" });
          return "skip";
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

  function retryLater(): void {
    schedule(backoff);
    backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
  }

  /**
   * Sends writes until none is left. A 5xx, 408, or 429 holds that spot for the
   * rest of the pass; a network error or 401 ends it. The backoff starts over
   * only after a pass that ends with nothing held.
   */
  async function pass(): Promise<void> {
    if (stopped || !ready || snapshot.signedOut || !deps.network.online()) return;
    emit({ syncing: true });
    const skipped = new Set<string>();
    let held = false;
    try {
      for (;;) {
        // stop() (sign-out) can land during a send; nothing new starts after it.
        if (stopped) break;
        const { next: picked, held: heldNow } = await pick(skipped);
        held = heldNow;
        if (picked === null) break;
        signal.post();
        await refresh();
        // The network call runs outside the lock, so saves and discards are never blocked by it.
        const result = await send(picked.record, picked.base);
        const step = await settle(picked.record, result);
        signal.post();
        if (step === "skip") skipped.add(picked.record.spot_id);
        if (step === "stop") {
          if (!snapshot.signedOut) retryLater();
          return;
        }
      }
      if (skipped.size > 0) {
        retryLater();
      } else if (held) {
        // A tab that dies mid-send never says so; look again even if nothing else triggers a pass.
        schedule(HELD_RECHECK_MS);
        backoff = BACKOFF_START_MS;
      } else {
        cancelTimer?.();
        cancelTimer = null;
        backoff = BACKOFF_START_MS;
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
    signal.post();
  }

  /** Loads the queue, resets writes cut off mid-send, and starts listening for triggers. */
  async function start(): Promise<void> {
    stopped = false;
    ready = false;
    // Reading the queue needs neither the liveness hold nor the lock, so it goes first.
    load();
    // Triggers listen from the start, whatever happens to the steps below.
    unsubscribe = [
      signal.subscribe(() => {
        void refresh().catch(() => undefined);
        void sync();
      }),
      deps.network.subscribe((online) => {
        emit({ online });
        if (online) void sync();
      }),
      deps.foreground.subscribe(() => void sync()),
    ];
    // The network may have changed between createOutbox and subscribing.
    emit({ online: deps.network.online() });
    try {
      self = await liveness.hold();
    } catch {
      // Web Locks failed: this tab then answers for itself only, like a browser without them.
      liveness = createLocalLiveness(deps.cache, deps.ids);
      self = await liveness.hold();
    }
    try {
      await locked(async () => {
        for (const r of await store.list()) {
          // A live tab's in-flight write is left alone; a gone tab's goes back in the queue.
          if (r.state === "syncing" && r.owner !== self && !(await sendingElsewhere(r))) {
            await store.put({ ...r, state: "pending" });
          }
        }
        for (const moved of rewriteSpotIds(await store.list(), await store.idMap())) {
          await store.put(moved);
        }
      });
      signal.post();
    } catch {
      // Storage trouble: the queue is untouched; the next pass or read tries again.
    }
    ready = true;
    await refresh().catch(() => undefined);
    await sync();
  }

  return {
    start,
    stop(): void {
      stopped = true;
      ready = false;
      cancelLoad?.();
      cancelLoad = null;
      liveness.release();
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
    /**
     * Re-reads the queue into the snapshot. A storage timeout is reported as unknown, so
     * a caller whose save threw reloads before offering Retry: the write may have landed.
     */
    async reload(): Promise<void> {
      await refresh();
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
    /**
     * Queues a new draft and returns its local id. With a `key` (a uuid the screen made
     * once per submit) the id is `local:<key>` and calling again is a no-op, so a retry
     * after a failed or timed-out save cannot make two drafts.
     */
    async createSpot(identity: IdentitySection, key: string | null = null): Promise<string> {
      const spotId = `${LOCAL_PREFIX}${key ?? deps.ids.uuid()}`;
      await enqueue(
        { kind: "spot.create", spot_id: spotId, payload: { identity } },
        null,
        null,
        null,
        key !== null,
      );
      return spotId;
    },
    /** Queues a write. `serverVersion` is the version the surveyor saw; null for a local spot. */
    enqueue: (write: SpotWrite, serverVersion: number | null): Promise<string> =>
      enqueue(write, serverVersion),
    /** With a `clientWriteId` picked by the caller, queuing the same photo again is a no-op. */
    addPhoto: (
      spotId: string,
      serverVersion: number | null,
      bytes: Uint8Array,
      takenAt: Date,
      clientWriteId: string | null = null,
    ) =>
      enqueue(
        {
          kind: "photo.upload",
          spot_id: spotId,
          payload: { taken_at: takenAt.toISOString(), byte_size: bytes.byteLength },
        },
        serverVersion,
        bytes,
        clientWriteId,
        clientWriteId !== null,
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
        const fresh = await raiseVersion(current.id, current.version);
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
        } else if (fresh) {
          notify(current, null, null);
        }
        await store.remove(r.client_write_id);
      }),
    /** Storage keys of records that fail to parse (counted in `unreadable`), for the UI to list. */
    unreadableKeys: (): Promise<string[]> => store.unreadable(),
    /**
     * Deletes one unreadable record (a key from `unreadableKeys`) and its photo
     * bytes. Readable records are untouched: use `discard` for those.
     */
    async discardUnreadable(key: string): Promise<void> {
      await locked(() => store.removeUnreadable(key));
      signal.post();
      await refresh();
    },
    /**
     * The server changed a spot outside the outbox (this surveyor's own unpublish or photo
     * approval) and answered with its new version. Stores it the way a sent write's answer
     * is, and moves an unsent write's pinned base version up to it, so the write is not
     * a conflict with the surveyor's own action. Never lowers a version.
     */
    async noteServerVersion(spotId: string, version: number): Promise<void> {
      await locked(async () => {
        await raiseVersion(spotId, version);
        for (const r of await store.list()) {
          if (r.spot_id !== spotId || r.state !== "pending") continue;
          if (r.base_version === null || r.base_version >= version) continue;
          if (r.kind === "spot.section" || r.kind === "spot.verify" || r.kind === "spot.review") {
            await store.put({ ...r, base_version: version });
          }
        }
      });
      await refresh();
      signal.post();
    },
    /** After signing in again on this phone. Starts the outbox again if stop() ended it (sign-out). */
    resume(): void {
      emit({ signedOut: false });
      if (stopped) void start();
      else void sync();
    },
    syncNow: (): Promise<void> => sync(),
    /** Resolves when the current pass (if any) ends, without asking for another. */
    idle: (): Promise<void> => running ?? Promise.resolve(),
  };
}
