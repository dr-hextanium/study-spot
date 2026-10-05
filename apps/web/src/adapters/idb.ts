import type { BinaryCache, KeyValueCache } from "@study-spot/ui-logic";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { withTimeout } from "./timeout.ts";

export const DB_NAME = "study-spot";
const DB_VERSION = 1;
/** IndexedDB calls that take longer than this reject, so the outbox retries instead of hanging. */
export const STORAGE_TIMEOUT_MS = 10_000;

interface StudySpotDb extends DBSchema {
  kv: { key: string; value: string };
  bin: { key: string; value: Uint8Array };
}

export type Stores = { cache: KeyValueCache; blobs: BinaryCache; close(): void };

/** A copy as a plain Uint8Array, whatever realm or view type IndexedDB handed back. */
function toBytes(value: unknown): Uint8Array | null {
  if (!ArrayBuffer.isView(value)) return null;
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
}

/**
 * The outbox queue, photo bytes, and the persisted query cache, in one
 * IndexedDB database with a string store and a binary store.
 */
export function openStores(name: string = DB_NAME): Stores {
  let db: Promise<IDBPDatabase<StudySpotDb>> | null = null;
  const conn = (): Promise<IDBPDatabase<StudySpotDb>> => {
    db ??= openDB<StudySpotDb>(name, DB_VERSION, {
      upgrade(d) {
        d.createObjectStore("kv");
        d.createObjectStore("bin");
      },
    }).catch((error: unknown) => {
      db = null;
      throw error;
    });
    return db;
  };
  const run = <T>(what: string, fn: (d: IDBPDatabase<StudySpotDb>) => Promise<T>) =>
    withTimeout(
      conn().then((d) => fn(d)),
      STORAGE_TIMEOUT_MS,
      what,
    );

  const cache: KeyValueCache = {
    get: (key) =>
      run("kv get", async (d) => {
        const value: unknown = await d.get("kv", key);
        return typeof value === "string" ? value : null;
      }),
    set: (key, value) =>
      run("kv set", async (d) => {
        await d.put("kv", value, key);
      }),
    delete: (key) =>
      run("kv delete", async (d) => {
        await d.delete("kv", key);
      }),
    keys: (prefix) =>
      run("kv keys", (d) => d.getAllKeys("kv", IDBKeyRange.bound(prefix, `${prefix}￿`))),
  };
  const blobs: BinaryCache = {
    get: (key) => run("bin get", async (d) => toBytes(await d.get("bin", key))),
    set: (key, bytes) =>
      run("bin set", async (d) => {
        await d.put("bin", bytes, key);
      }),
    delete: (key) =>
      run("bin delete", async (d) => {
        await d.delete("bin", key);
      }),
  };
  return {
    cache,
    blobs,
    close: () => {
      void db?.then((d) => d.close());
      db = null;
    },
  };
}
