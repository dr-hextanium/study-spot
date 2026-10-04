import { BUNDLE_SCHEMA_MAJOR, BundlePointer, type PublishStatus } from "@study-spot/core";
import { buildBundle, building, bundle_state, type Db, spot, spot_photo } from "@study-spot/db";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Clock } from "../clock.ts";
import { type PhotoStore, sha256Hex } from "../photos/store.ts";
import type { PublishQueue } from "../writes/withWrite.ts";
import { DATA_HEADERS, type PublishFile, type PublishTarget } from "./target.ts";

export const PUBLISH_DEBOUNCE_MS = 30_000;

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
  /** Absolute data-site base URL without a trailing slash. */
  dataBaseUrl: string;
  clock: Clock;
  timers?: Timers;
  debounceMs?: number;
  log?: (message: string, error?: unknown) => void;
};

export type PublishOutcome =
  | { ok: true; hash: string; warnings: string[]; uploaded: string[] }
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
  const log = deps.log ?? (() => {});
  const photoPrefix = `${deps.dataBaseUrl}/photos/`;
  let cancelTimer: (() => void) | null = null;
  let inFlight: Promise<PublishOutcome> | null = null;
  let queued: Promise<PublishOutcome> | null = null;
  let closed = false;

  async function readState() {
    const [row] = await deps.db
      .select()
      .from(bundle_state)
      .where(eq(bundle_state.campus_id, deps.campusId));
    return row ?? null;
  }

  async function runOnce(): Promise<PublishOutcome> {
    const startedAt = deps.clock.now();
    let seq = 0;
    try {
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
            inArray(
              spot_photo.spot_id,
              deps.db
                .select({ id: spot.id })
                .from(spot)
                .innerJoin(building, eq(spot.building_id, building.id))
                .where(eq(building.campus_id, deps.campusId)),
            ),
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

      const photoFiles = new Map<string, PublishFile>();
      for (const s of bundle.spots) {
        for (const p of s.photos) {
          if (!p.url.startsWith(photoPrefix)) continue;
          const sha = p.url.slice(photoPrefix.length, -".jpg".length);
          photoFiles.set(sha, {
            path: `photos/${sha}.jpg`,
            contentType: "image/jpeg",
            bytes: async () => {
              const bytes = await deps.photos.get(sha);
              if (bytes === null) throw new Error(`photo blob ${sha} is missing`);
              return bytes;
            },
          });
        }
      }

      // Photos and the hashed bundle first, the pointer last.
      const files: PublishFile[] = [
        ...photoFiles.values(),
        { path: bundlePath, contentType: "application/json", bytes: async () => utf8(json) },
        { path: "_headers", contentType: "text/plain", bytes: async () => utf8(DATA_HEADERS) },
        {
          path: "bundle-latest.json",
          contentType: "application/json",
          bytes: async () => utf8(JSON.stringify(pointer)),
        },
      ];
      const { uploaded } = await deps.target.deploy(files);

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
      return { ok: true, hash, warnings, uploaded };
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
      return { ok: false, error: message };
    }
  }

  const publisher: Publisher = {
    schedule() {
      if (closed) return;
      cancelTimer?.();
      cancelTimer = timers.after(debounceMs, () => {
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
      return {
        dirty: row?.dirty ?? false,
        running: inFlight !== null,
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
    },
  };
  return publisher;
}
