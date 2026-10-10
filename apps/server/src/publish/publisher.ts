import { randomUUID } from "node:crypto";
import { BUNDLE_SCHEMA_MAJOR, BundlePointer, type PublishStatus } from "@perch/core";
import {
  buildBundle,
  building,
  bundle_state,
  type Db,
  photo_blob,
  spot,
  spot_photo,
} from "@perch/db";
import {
  and,
  asc,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  not,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import type { Clock } from "../clock.ts";
import { type PhotoStore, photoPath, sha256Hex } from "../photos/store.ts";
import type { PublishQueue } from "../writes/withWrite.ts";
import type { DataSite } from "./dataSite.ts";
import { pagesHash } from "./pagesTarget.ts";
import { DATA_HEADERS, type PublishFile, type PublishTarget } from "./target.ts";

export const PUBLISH_DEBOUNCE_MS = 30_000;
/** A debounced run fires no later than this after the first pending write. */
export const PUBLISH_MAX_WAIT_MS = 60_000;
/** Retry delays after consecutive failures; the last repeats until a run succeeds. */
export const PUBLISH_RETRY_MS: readonly number[] = [60_000, 120_000, 300_000];
/**
 * How long a publish lease lasts without renewal. A run renews it right before its
 * deploy; a crashed run blocks other processes for at most this long.
 */
export const PUBLISH_LEASE_MS = 10 * 60_000;
export const PUBLISH_BUSY = "another publish is running";
/** How long the lease is kept after a deployment POST that did not answer. */
const POST_SETTLE_SECS = 120;

/** Scheduling seam: real timers in production, a manual fake in tests. */
export type Timers = { after(ms: number, fn: () => void): () => void };

export const realTimers: Timers = {
  after(ms, fn) {
    const handle = setTimeout(fn, ms);
    handle.unref();
    return () => clearTimeout(handle);
  },
};

export type PublisherDeps = {
  db: Db;
  campusId: string;
  target: PublishTarget;
  photos: PhotoStore;
  /** Reads the published site back, to confirm a photo before its Postgres bytes are cleared. */
  dataSite: DataSite;
  /** Absolute data-site base URL without a trailing slash. */
  dataBaseUrl: string;
  clock: Clock;
  timers?: Timers;
  debounceMs?: number;
  maxWaitMs?: number;
  retryMs?: readonly number[];
  leaseMs?: number;
  log?: (message: string, error?: unknown) => void;
  /** Test seam: runs after the file set is built and before the lease renewal and deploy. */
  beforeDeploy?: () => Promise<void>;
};

export type PublishOutcome =
  | {
      ok: true;
      hash: string;
      warnings: string[];
      uploaded: string[];
      /** sha256 of photos whose bytes left Postgres after this deploy was confirmed. */
      offloaded: string[];
    }
  | { ok: false; error: string };

export type Publisher = PublishQueue & {
  /** Publishes now. A call during a run queues exactly one follow-up run. */
  runNow(): Promise<PublishOutcome>;
  /** On boot: publish right away if a previous process left the bundle dirty. */
  start(): Promise<void>;
  status(): Promise<PublishStatus>;
  close(): void;
};

const Warnings = z.array(z.string());
const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

export function createPublisher(deps: PublisherDeps): Publisher {
  const timers = deps.timers ?? realTimers;
  const debounceMs = deps.debounceMs ?? PUBLISH_DEBOUNCE_MS;
  const maxWaitMs = deps.maxWaitMs ?? PUBLISH_MAX_WAIT_MS;
  const retryMs = deps.retryMs ?? PUBLISH_RETRY_MS;
  const log = deps.log ?? (() => {});
  const leaseSecs = (deps.leaseMs ?? PUBLISH_LEASE_MS) / 1000;
  const photoPrefix = `${deps.dataBaseUrl}/photos/`;
  let cancelTimer: (() => void) | null = null;
  let cancelRetry: (() => void) | null = null;
  /** When the oldest write still waiting for a debounced run was scheduled. */
  let firstPendingAt: number | null = null;
  let failures = 0;
  let inFlight: Promise<PublishOutcome> | null = null;
  let queued: Promise<PublishOutcome> | null = null;
  let closed = false;

  function clearRetry(): void {
    cancelRetry?.();
    cancelRetry = null;
  }

  async function readState() {
    const [row] = await deps.db
      .select()
      .from(bundle_state)
      .where(eq(bundle_state.campus_id, deps.campusId));
    return row ?? null;
  }

  /*
   * The publish lease. inFlight and queued serialize runs inside one process; the
   * lease serializes them across processes (a second server, a deploy overlap), so a
   * run never deploys a manifest built before another run cleared photo bytes. It is
   * a row in bundle_state, not an advisory lock, because Neon's pooler does not keep
   * a session. Times come from the database clock, so process clocks do not matter.
   */
  const leaseUntil = () => sql`now() + make_interval(secs => ${leaseSecs}::double precision)`;

  async function claimLease(owner: string): Promise<boolean> {
    await deps.db.insert(bundle_state).values({ campus_id: deps.campusId }).onConflictDoNothing();
    const rows = await deps.db
      .update(bundle_state)
      .set({ publishing_owner: owner, publishing_until: leaseUntil() })
      .where(
        and(
          eq(bundle_state.campus_id, deps.campusId),
          or(isNull(bundle_state.publishing_until), lt(bundle_state.publishing_until, sql`now()`)),
        ),
      )
      .returning({ id: bundle_state.campus_id });
    return rows.length > 0;
  }

  /** Extends the lease if this run still holds it. */
  async function tryRenewLease(owner: string): Promise<boolean> {
    const rows = await deps.db
      .update(bundle_state)
      .set({ publishing_until: leaseUntil() })
      .where(leaseHeldBy(owner))
      .returning({ id: bundle_state.campus_id });
    return rows.length > 0;
  }

  /** Extends the lease; throws if another run took it. */
  async function renewLease(owner: string): Promise<void> {
    if (!(await tryRenewLease(owner))) throw new Error("publish lease lost before the deploy");
  }

  function leaseHeldBy(owner: string) {
    return and(
      eq(bundle_state.campus_id, deps.campusId),
      eq(bundle_state.publishing_owner, owner),
      gt(bundle_state.publishing_until, sql`now()`),
    );
  }

  async function releaseLease(owner: string, holdSecs: number): Promise<void> {
    try {
      await deps.db
        .update(bundle_state)
        .set(
          holdSecs > 0
            ? {
                publishing_until: sql`now() + make_interval(secs => ${holdSecs}::double precision)`,
              }
            : { publishing_owner: null, publishing_until: null },
        )
        .where(
          and(eq(bundle_state.campus_id, deps.campusId), eq(bundle_state.publishing_owner, owner)),
        );
    } catch (err) {
      // It expires on its own.
      log("could not release the publish lease", err);
    }
  }

  /** Spots of this campus. Other campuses share the database but have their own data site. */
  function campusSpots() {
    return deps.db
      .select({ id: spot.id })
      .from(spot)
      .innerJoin(building, eq(spot.building_id, building.id))
      .where(eq(building.campus_id, deps.campusId));
  }

  /**
   * Every photo file this deploy must contain: the bundle's photos, plus every photo
   * whose bytes already left Postgres and that a photo row of this campus still uses
   * (its spot may be unpublished now). A Pages deploy drops any file not listed, and
   * a cleared photo has no other copy, so leaving one out would lose it for good.
   * A cleared photo is listed by its stored Pages hash; its bytes are fetched back
   * from the data site only if Cloudflare reports that hash missing.
   */
  async function photoFileSet(
    bundleShas: ReadonlySet<string>,
  ): Promise<{ sha: string; cleared: boolean; file: PublishFile }[]> {
    const wanted = [...bundleShas];
    const rows = await deps.db
      .selectDistinct({
        sha: photo_blob.sha256,
        pagesHash: photo_blob.pages_hash,
        cleared: sql<boolean>`${photo_blob.bytes} is null`,
      })
      .from(photo_blob)
      .innerJoin(spot_photo, eq(spot_photo.blob_sha256, photo_blob.sha256))
      .where(
        and(
          inArray(spot_photo.spot_id, campusSpots()),
          wanted.length === 0
            ? isNull(photo_blob.bytes)
            : or(isNull(photo_blob.bytes), inArray(photo_blob.sha256, wanted)),
        ),
      )
      .orderBy(asc(photo_blob.sha256));
    const found = new Set(rows.map((r) => r.sha));
    for (const sha of bundleShas) {
      if (!found.has(sha)) throw new Error(`photo blob ${sha} is missing`);
    }
    return rows.map((r) => ({
      sha: r.sha,
      cleared: r.cleared,
      file: {
        path: photoPath(r.sha),
        contentType: "image/jpeg",
        ...(r.pagesHash === null ? {} : { pagesHash: r.pagesHash }),
        bytes: async () => {
          const bytes = await deps.photos.get(r.sha);
          if (bytes === null) {
            throw new Error(`photo ${r.sha} has no bytes in the database or on the data site`);
          }
          return bytes;
        },
      },
    }));
  }

  /**
   * After a deploy, clears the Postgres bytes of each listed photo that the data site
   * now serves with a matching sha256. Only photos used by approved rows of this
   * campus and by no row of another campus qualify. A photo that cannot be confirmed
   * keeps its bytes and is tried again after the next deploy. Never fails the publish.
   * Runs under the publish lease, which the clearing UPDATE checks.
   */
  async function offloadConfirmed(
    shas: readonly string[],
    at: Date,
    owner: string,
  ): Promise<string[]> {
    const done: string[] = [];
    for (const sha of shas) {
      // Each read-back can take seconds, so the lease is renewed per photo; once it is
      // gone, another run owns the site and this one stops clearing.
      try {
        if (!(await tryRenewLease(owner))) break;
      } catch (err) {
        log("could not renew the publish lease", err);
        break;
      }
      try {
        const path = photoPath(sha);
        const published = await deps.dataSite.get(path, { fresh: true });
        if (published === null || sha256Hex(published) !== sha) continue;
        const used = (approved: boolean) =>
          deps.db
            .select({ one: sql`1` })
            .from(spot_photo)
            .where(
              and(
                eq(spot_photo.blob_sha256, photo_blob.sha256),
                approved
                  ? and(
                      isNotNull(spot_photo.approved_at),
                      inArray(spot_photo.spot_id, campusSpots()),
                    )
                  : not(inArray(spot_photo.spot_id, campusSpots())),
              ),
            );
        const cleared = await deps.db
          .update(photo_blob)
          .set({ bytes: null, pages_hash: pagesHash(published, path), offloaded_at: at })
          .where(
            and(
              eq(photo_blob.sha256, sha),
              isNotNull(photo_blob.bytes),
              exists(used(true)),
              not(exists(used(false))),
              // Only while this run still holds the lease: a run that lost it may race
              // a newer deploy whose manifest was built before these bytes were cleared.
              // FOR SHARE locks the lease row until this clear commits, so a claim by
              // another process waits for it (or this clear sees the new owner and skips).
              exists(
                deps.db
                  .select({ one: sql`1` })
                  .from(bundle_state)
                  .where(leaseHeldBy(owner))
                  .for("share"),
              ),
            ),
          )
          .returning({ sha: photo_blob.sha256 });
        if (cleared.length > 0) done.push(sha);
      } catch (err) {
        log(`could not offload photo ${sha}`, err);
      }
    }
    return done;
  }

  async function runOnce(): Promise<PublishOutcome> {
    const startedAt = deps.clock.now();
    let seq = 0;
    // This run covers everything written so far; later writes schedule their own timers.
    cancelTimer?.();
    cancelTimer = null;
    clearRetry();
    firstPendingAt = null;
    const owner = randomUUID();
    let leased = false;
    /** True from the lease renewal before the deployment POST until the deploy returns. */
    let posting = false;
    try {
      leased = await claimLease(owner);
      if (!leased) {
        // Not a failure: the run holding the lease publishes. Try again later in case
        // this process's writes landed after that run read write_seq.
        if (!closed) {
          clearRetry();
          cancelRetry = timers.after(retryMs[0] ?? PUBLISH_MAX_WAIT_MS, () => {
            cancelRetry = null;
            void publisher.runNow();
          });
        }
        return { ok: false, error: PUBLISH_BUSY };
      }
      seq = (await readState())?.write_seq ?? 0;

      // Approved blob-backed photos of this campus get their absolute data-site URL before
      // the build. Other campuses share the database but publish to their own data site.
      const target = sql<string>`${photoPrefix} || ${spot_photo.blob_sha256} || '.jpg'`;
      await deps.db
        .update(spot_photo)
        .set({ url: target })
        .where(
          and(
            isNotNull(spot_photo.blob_sha256),
            isNotNull(spot_photo.approved_at),
            sql`${spot_photo.url} is distinct from ${target}`,
            inArray(spot_photo.spot_id, campusSpots()),
          ),
        );

      const { bundle, warnings } = await buildBundle(deps.db, deps.campusId, startedAt);
      const json = JSON.stringify(bundle);
      const hash = sha256Hex(utf8(json)).slice(0, 16);
      const bundlePath = `bundle.${hash}.json`;
      const pointer = BundlePointer.parse({
        schema_version: BUNDLE_SCHEMA_MAJOR,
        hash,
        url: bundlePath,
        generated_at: bundle.generated_at,
      });

      const bundleShas = new Set<string>();
      for (const s of bundle.spots) {
        for (const p of s.photos) {
          if (p.url.startsWith(photoPrefix)) {
            bundleShas.add(p.url.slice(photoPrefix.length, -".jpg".length));
          }
        }
      }
      const photoFiles = await photoFileSet(bundleShas);

      // Photos and the hashed bundle first, the pointer last.
      const files: PublishFile[] = [
        ...photoFiles.map((p) => p.file),
        { path: bundlePath, contentType: "application/json", bytes: async () => utf8(json) },
        { path: "_headers", contentType: "text/plain", bytes: async () => utf8(DATA_HEADERS) },
        {
          path: "bundle-latest.json",
          contentType: "application/json",
          bytes: async () => utf8(JSON.stringify(pointer)),
        },
      ];
      await deps.beforeDeploy?.();
      await renewLease(owner);
      const { uploaded } = await deps.target.deploy(files, {
        beforeDeployment: async () => {
          await renewLease(owner);
          posting = true;
        },
      });
      posting = false;
      const offloaded = await offloadConfirmed(
        photoFiles.filter((p) => !p.cleared).map((p) => p.sha),
        startedAt,
        owner,
      );

      // Clear dirty only if no write landed while this run was building.
      const [after] = await deps.db
        .update(bundle_state)
        .set({
          dirty: sql`${bundle_state.write_seq} <> ${seq}`,
          last_published_at: startedAt,
          last_hash: hash,
          last_attempt_at: startedAt,
          last_warnings: warnings,
          last_error: null,
        })
        .where(eq(bundle_state.campus_id, deps.campusId))
        .returning({ dirty: bundle_state.dirty });
      if (!after) {
        await deps.db.insert(bundle_state).values({
          campus_id: deps.campusId,
          dirty: false,
          last_published_at: startedAt,
          last_hash: hash,
          last_attempt_at: startedAt,
          last_warnings: warnings,
        });
      } else if (after.dirty) {
        publisher.schedule();
      }
      failures = 0;
      return { ok: true, hash, warnings, uploaded, offloaded };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log("publish failed", err);
      try {
        await deps.db
          .insert(bundle_state)
          .values({
            campus_id: deps.campusId,
            dirty: true,
            last_attempt_at: startedAt,
            last_error: message,
          })
          .onConflictDoUpdate({
            target: bundle_state.campus_id,
            set: { last_attempt_at: startedAt, last_error: message },
          });
      } catch (stateErr) {
        log("could not record publish failure", stateErr);
      }
      if (!closed) {
        const delay = retryMs[Math.min(failures, retryMs.length - 1)] ?? PUBLISH_MAX_WAIT_MS;
        failures += 1;
        clearRetry();
        cancelRetry = timers.after(delay, () => {
          cancelRetry = null;
          void publisher.runNow();
        });
      }
      return { ok: false, error: message };
    } finally {
      // A deployment POST that failed or timed out may still land at Cloudflare a little
      // later, so the lease is held a while longer instead of freed for another run.
      if (leased) await releaseLease(owner, posting ? POST_SETTLE_SECS : 0);
    }
  }

  const publisher: Publisher = {
    schedule() {
      if (closed) return;
      cancelTimer?.();
      const now = deps.clock.now().getTime();
      firstPendingAt ??= now;
      const remaining = Math.max(0, firstPendingAt + maxWaitMs - now);
      cancelTimer = timers.after(Math.min(debounceMs, remaining), () => {
        cancelTimer = null;
        void publisher.runNow();
      });
    },

    runNow() {
      if (inFlight === null) {
        inFlight = runOnce().finally(() => {
          inFlight = null;
        });
        return inFlight;
      }
      if (queued === null) {
        queued = inFlight.then(() => {
          queued = null;
          return publisher.runNow();
        });
      }
      return queued;
    },

    async start() {
      try {
        if ((await readState())?.dirty) await publisher.runNow();
      } catch (err) {
        log("publish startup check failed", err);
      }
    },

    async status() {
      const row = await readState();
      const warnings = Warnings.safeParse(row?.last_warnings);
      // Another process holding an unexpired lease is running too.
      const [lease] = await deps.db
        .select({ held: sql<boolean>`${bundle_state.publishing_until} > now()` })
        .from(bundle_state)
        .where(eq(bundle_state.campus_id, deps.campusId));
      return {
        dirty: row?.dirty ?? false,
        running: inFlight !== null || lease?.held === true,
        last_published_at: row?.last_published_at?.toISOString() ?? null,
        last_hash: row?.last_hash ?? null,
        last_attempt_at: row?.last_attempt_at?.toISOString() ?? null,
        warnings: warnings.success ? warnings.data : [],
        last_error: row?.last_error ?? null,
      };
    },

    close() {
      closed = true;
      cancelTimer?.();
      cancelTimer = null;
      clearRetry();
    },
  };
  return publisher;
}
