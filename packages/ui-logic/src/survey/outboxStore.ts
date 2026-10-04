import { z } from "zod";
import type { BinaryCache, Clock, KeyValueCache } from "../adapters.ts";
import { bySeq, WriteRecord } from "./writes.ts";

/*
 * One key per record, so two tabs adding writes never overwrite each other.
 * Keys: outbox:w:<client_write_id>, outbox:id:<local id> (real id),
 * outbox:v:<spot id> (last known version), outbox:seq. Photo bytes live in the
 * BinaryCache under photo:<client_write_id>.
 */
const WRITE = "outbox:w:";
const ID = "outbox:id:";
const VERSION = "outbox:v:";
const SEQ = "outbox:seq";

export function photoKey(clientWriteId: string): string {
  return `photo:${clientWriteId}`;
}

const Version = z.number().int().positive();
const Seq = z.number().int().nonnegative();
const RealId = z.uuid();

async function readJson<T>(cache: KeyValueCache, key: string, schema: z.ZodType<T>) {
  const raw = await cache.get(key);
  if (raw === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type OutboxStore = ReturnType<typeof createOutboxStore>;

export function createOutboxStore(deps: {
  cache: KeyValueCache;
  blobs: BinaryCache;
  clock: Clock;
}) {
  const { cache, blobs } = deps;
  async function list(): Promise<WriteRecord[]> {
    const keys = await cache.keys(WRITE);
    const records: WriteRecord[] = [];
    for (const key of keys) {
      const r = await readJson(cache, key, WriteRecord);
      if (r) records.push(r);
    }
    return records.sort(bySeq);
  }
  let seqChain: Promise<void> = Promise.resolve();
  return {
    /** Every readable record in queue order. Unreadable records are skipped, not deleted. */
    list,
    async put(record: WriteRecord): Promise<void> {
      await cache.set(`${WRITE}${record.client_write_id}`, JSON.stringify(record));
    },
    /** Deletes a record and any photo bytes stored for it. */
    async remove(clientWriteId: string): Promise<void> {
      await cache.delete(`${WRITE}${clientWriteId}`);
      await blobs.delete(photoKey(clientWriteId));
    },
    /**
     * Next queue position: the clock in ms, but always after the last one handed out
     * and after every queued record, even if the stored counter was evicted. Calls are
     * serialized in this process. Across tabs this is not atomic (KeyValueCache has no
     * compare-and-set), so two tabs can in rare cases draw the same value.
     */
    nextSeq(): Promise<number> {
      const run = seqChain.then(async () => {
        const stored = (await readJson(cache, SEQ, Seq)) ?? 0;
        const queued = (await list()).reduce((max, r) => Math.max(max, r.seq), 0);
        const seq = Math.max(deps.clock.now().getTime(), stored + 1, queued + 1);
        await cache.set(SEQ, JSON.stringify(seq));
        return seq;
      });
      seqChain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    async idMap(): Promise<Record<string, string>> {
      const map: Record<string, string> = {};
      for (const key of await cache.keys(ID)) {
        const real = await readJson(cache, key, RealId);
        if (real) map[key.slice(ID.length)] = real;
      }
      return map;
    },
    async mapId(localId: string, realId: string): Promise<void> {
      await cache.set(`${ID}${localId}`, JSON.stringify(realId));
    },
    async version(spotId: string): Promise<number | null> {
      return readJson(cache, `${VERSION}${spotId}`, Version);
    },
    async setVersion(spotId: string, version: number): Promise<void> {
      await cache.set(`${VERSION}${spotId}`, JSON.stringify(version));
    },
    async putPhoto(clientWriteId: string, bytes: Uint8Array): Promise<void> {
      await blobs.set(photoKey(clientWriteId), bytes);
    },
    /** Photo bytes, or null when missing or unreadable (evicted storage). */
    async photo(clientWriteId: string): Promise<Uint8Array | null> {
      try {
        return await blobs.get(photoKey(clientWriteId));
      } catch {
        return null;
      }
    },
  };
}
