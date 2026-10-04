/**
 * Platform adapters. apps/web implements these with browser APIs; a future
 * Expo app implements them with React Native modules. Shared code depends
 * only on these interfaces.
 */

/** Synchronous small key-value store (localStorage, MMKV). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Asynchronous larger store (IndexedDB, AsyncStorage). */
export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every stored key starting with `prefix`, in any order. */
  keys(prefix: string): Promise<string[]>;
}

/** Asynchronous store for binary records such as photo bytes (IndexedDB). */
export interface BinaryCache {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, bytes: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Random RFC 4122 version 4 ids (crypto.randomUUID on web). */
export interface Ids {
  uuid(): string;
}

/** Relative timers (setTimeout on web). `after` returns a cancel function. */
export interface Timers {
  after(ms: number, fn: () => void): () => void;
}

/** Fires when the app returns to the foreground (visibilitychange on web, AppState on Expo). */
export interface Foreground {
  subscribe(listener: () => void): () => void;
}

/**
 * Mutual exclusion by name. `run` waits for the lock, runs `fn`, and releases
 * when `fn` settles. `createLocalLock` covers one JS context (one tab); apps/web
 * backs this with the Web Locks API so tabs sharing storage also take turns.
 */
export interface Lock {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

export interface Clock {
  now(): Date;
}

export type LatLngFix = { lat: number; lng: number; accuracyMeters: number };

export interface GeolocationAdapter {
  /** Resolves null when permission is denied or no fix is available. */
  current(): Promise<LatLngFix | null>;
}

export interface Share {
  share(data: { title: string; url: string }): Promise<"shared" | "copied" | "failed">;
}

export interface NetworkStatus {
  online(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}

export type FetchResponse = { status: number; text: string };

export interface Fetch {
  /** Rejects on network failure. Non-2xx statuses resolve normally. */
  getText(url: string): Promise<FetchResponse>;
}

export type HttpMethod = "GET" | "POST" | "PUT";
export type HttpFile = { field: string; filename: string; contentType: string; bytes: Uint8Array };
export type HttpBody =
  | { kind: "json"; json: string }
  | { kind: "multipart"; fields: Readonly<Record<string, string>>; file: HttpFile };
export type HttpRequest = {
  method: HttpMethod;
  url: string;
  headers: Readonly<Record<string, string>>;
  body: HttpBody | null;
};

/**
 * JSON and multipart requests for the survey API. Rejects on network failure
 * or after the implementation's timeout; non-2xx statuses resolve normally.
 * Implementations set the multipart content type themselves.
 */
export interface Http {
  send(request: HttpRequest): Promise<FetchResponse>;
}
